import { describe, it, expect, beforeEach } from 'vitest';
import { organizationService, OrganizationError } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { OrgContext } from '@/types';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';
import { resetDatabaseForTests } from '@/lib/db';
import { AuthorizationError } from '@/lib/permissions/rbac';

function createMockContext(role: 'MAIN_ADMIN' | 'ORG_ADMIN' | 'EMPLOYEE', orgId: string, userId: string): OrgContext {
  return {
    userId,
    organizationId: orgId,
    role,
    permissions: ROLE_PERMISSIONS[role],
    user: {
      id: userId,
      email: `${role.toLowerCase()}@test.com`,
      name: `${role} User`,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    organization: {
      id: orgId,
      name: 'Test Org',
      slug: 'test-org',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

describe('Organization & User Services with RBAC', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe('Organization Service', () => {
    it('MAIN_ADMIN can list all organizations', async () => {
      const mainAdminCtx = createMockContext(
        'MAIN_ADMIN',
        'c0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001'
      );

      const orgs = await organizationService.list(mainAdminCtx);
      expect(orgs.length).toBeGreaterThanOrEqual(3);
    });

    it('ORG_ADMIN can only list organizations they belong to', async () => {
      const acmeAdminCtx = createMockContext(
        'ORG_ADMIN',
        'c0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000002' // Alice Admin (Acme)
      );

      const orgs = await organizationService.list(acmeAdminCtx);
      // Acme Admin only belongs to Acme Voice Corp
      expect(orgs.length).toBe(1);
      expect(orgs[0].slug).toBe('acme-voice');
    });

    it('MAIN_ADMIN can create new organization', async () => {
      const mainAdminCtx = createMockContext(
        'MAIN_ADMIN',
        'c0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001'
      );

      const created = await organizationService.create(
        {
          name: 'Pied Piper Audio',
          slug: 'pied-piper-audio',
          brand_name: 'Pied Piper AI',
        },
        mainAdminCtx
      );

      expect(created.name).toBe('Pied Piper Audio');
      expect(created.status).toBe('ACTIVE');
    });

    it('ORG_ADMIN cannot create child organizations', async () => {
      const orgAdminCtx = createMockContext(
        'ORG_ADMIN',
        'c0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000002'
      );

      await expect(
        organizationService.create(
          {
            name: 'Unauthorized Org',
            slug: 'unauthorized-org',
          },
          orgAdminCtx
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects duplicate organization slug', async () => {
      const mainAdminCtx = createMockContext(
        'MAIN_ADMIN',
        'c0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001'
      );

      await expect(
        organizationService.create(
          {
            name: 'Acme Voice Corp Duplicate',
            slug: 'acme-voice', // already exists in seed
          },
          mainAdminCtx
        )
      ).rejects.toThrow(OrganizationError);
    });

    it('MAIN_ADMIN can suspend an organization', async () => {
      const mainAdminCtx = createMockContext(
        'MAIN_ADMIN',
        'c0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001'
      );

      const suspended = await organizationService.suspend(
        'c0000000-0000-0000-0000-000000000002',
        'SUSPENDED',
        mainAdminCtx
      );

      expect(suspended.status).toBe('SUSPENDED');
    });
  });

  describe('User Service & Organization Membership', () => {
    it('ORG_ADMIN can create and invite employee to their organization', async () => {
      const acmeAdminCtx = createMockContext(
        'ORG_ADMIN',
        'c0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000002'
      );

      const member = await userService.create(
        {
          email: 'newhire@acme.com',
          name: 'New Hire',
          role: 'EMPLOYEE',
          password: 'Password123!',
        },
        acmeAdminCtx
      );

      expect(member.user?.email).toBe('newhire@acme.com');
      expect(member.organization_id).toBe('c0000000-0000-0000-0000-000000000002');
      expect(member.role).toBe('EMPLOYEE');
    });

    it('ORG_ADMIN cannot create a MAIN_ADMIN user', async () => {
      const acmeAdminCtx = createMockContext(
        'ORG_ADMIN',
        'c0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000002'
      );

      await expect(
        userService.create(
          {
            email: 'rogueadmin@acme.com',
            name: 'Rogue Admin',
            role: 'MAIN_ADMIN',
            password: 'Password123!',
          },
          acmeAdminCtx
        )
      ).rejects.toThrow('Only Main Admins can create Main Admin accounts');
    });

    it('EMPLOYEE cannot invite users', async () => {
      const employeeCtx = createMockContext(
        'EMPLOYEE',
        'c0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003'
      );

      await expect(
        userService.create(
          {
            email: 'unauthorized@acme.com',
            name: 'Unauthorized User',
            role: 'EMPLOYEE',
          },
          employeeCtx
        )
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
