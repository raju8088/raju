import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabaseForTests } from '@/lib/db';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { authService, AuthError } from '@/services/auth.service';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';
import { AuthorizationError, assertTenantAccess } from '@/lib/permissions/rbac';
import { OrgContext, User, Organization } from '@/types';

describe('Mandatory Multi-Tenant Security & Bidirectional Isolation', () => {
  let orgA: Organization;
  let orgB: Organization;
  let userA: User;
  let userB: User;
  let ctxA: OrgContext;
  let ctxB: OrgContext;

  beforeEach(async () => {
    await resetDatabaseForTests();

    // Context for bootstrapping test tenants
    const bootstrapCtx: OrgContext = {
      userId: 'd0000000-0000-0000-0000-000000000001',
      organizationId: 'c0000000-0000-0000-0000-000000000001',
      role: 'MAIN_ADMIN',
      permissions: ROLE_PERMISSIONS['MAIN_ADMIN'],
      user: {
        id: 'd0000000-0000-0000-0000-000000000001',
        email: 'admin@voicenuvo.com',
        name: 'Main Admin',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      organization: {
        id: 'c0000000-0000-0000-0000-000000000001',
        name: 'VoiceNuvo Platform',
        slug: 'voicenuvo-platform',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    // 1. Create Organization A
    orgA = await organizationService.create(
      {
        name: 'Tenant Alpha Corp',
        slug: 'tenant-alpha-corp',
        brand_name: 'Alpha Voice',
      },
      bootstrapCtx
    );

    // Create user in Org A (ORG_ADMIN)
    const memberA = await userService.create(
      {
        email: 'admin@alpha-corp.com',
        name: 'Alice Alpha',
        role: 'ORG_ADMIN',
        organization_id: orgA.id,
        password: 'PasswordAlpha123!',
      },
      bootstrapCtx
    );
    userA = memberA.user!;

    ctxA = {
      userId: userA.id,
      organizationId: orgA.id,
      role: 'ORG_ADMIN',
      permissions: ROLE_PERMISSIONS['ORG_ADMIN'],
      user: userA,
      organization: orgA,
    };

    // 2. Create Organization B
    orgB = await organizationService.create(
      {
        name: 'Tenant Beta Logistics',
        slug: 'tenant-beta-logistics',
        brand_name: 'Beta Voice',
      },
      bootstrapCtx
    );

    // Create user in Org B (ORG_ADMIN)
    const memberB = await userService.create(
      {
        email: 'admin@beta-logistics.com',
        name: 'Bob Beta',
        role: 'ORG_ADMIN',
        organization_id: orgB.id,
        password: 'PasswordBeta123!',
      },
      bootstrapCtx
    );
    userB = memberB.user!;

    ctxB = {
      userId: userB.id,
      organizationId: orgB.id,
      role: 'ORG_ADMIN',
      permissions: ROLE_PERMISSIONS['ORG_ADMIN'],
      user: userB,
      organization: orgB,
    };
  });

  describe('Direction 1: Tenant Alpha attempting unauthorized access to Tenant Beta', () => {
    it('Tenant Alpha cannot read Organization Beta details', async () => {
      await expect(organizationService.getById(orgB.id, ctxA)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('Tenant Alpha cannot list or view Organization Beta users', async () => {
      // userService.list is scoped by context's organizationId
      const usersInMyOrg = await userService.list(ctxA);
      // None of the returned users should belong to Org B
      const containsBetaUser = usersInMyOrg.some((m) => m.organization_id === orgB.id || m.user_id === userB.id);
      expect(containsBetaUser).toBe(false);

      // Directly asserting tenant access to Org B fails
      expect(() => assertTenantAccess(ctxA, orgB.id)).toThrow('Tenant Isolation Violation');
    });

    it('Tenant Alpha cannot update Organization Beta', async () => {
      await expect(
        organizationService.update(
          orgB.id,
          { name: 'Compromised Name' },
          ctxA
        )
      ).rejects.toThrow(AuthorizationError);

      // Verify Org B name remains unchanged
      const orgBFresh = await db.organizations.findById(orgB.id);
      expect(orgBFresh?.name).toBe('Tenant Beta Logistics');
    });

    it('Tenant Alpha cannot suspend or delete Organization Beta', async () => {
      await expect(
        organizationService.suspend(orgB.id, 'SUSPENDED', ctxA)
      ).rejects.toThrow(AuthorizationError);
    });

    it('Tenant Alpha cannot invite or create a user into Organization Beta', async () => {
      await expect(
        userService.create(
          {
            email: 'intruder@alpha.com',
            name: 'Intruder',
            role: 'EMPLOYEE',
            organization_id: orgB.id,
            password: 'Password123!',
          },
          ctxA
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('Tenant Alpha cannot switch organization context to Organization Beta', async () => {
      await expect(
        authService.switchOrganization(userA.id, orgB.id)
      ).rejects.toThrow(AuthError);
    });
  });

  describe('Direction 2: Tenant Beta attempting unauthorized access to Tenant Alpha (Reverse)', () => {
    it('Tenant Beta cannot read Organization Alpha details', async () => {
      await expect(organizationService.getById(orgA.id, ctxB)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('Tenant Beta cannot list or view Organization Alpha users', async () => {
      const usersInMyOrg = await userService.list(ctxB);
      const containsAlphaUser = usersInMyOrg.some((m) => m.organization_id === orgA.id || m.user_id === userA.id);
      expect(containsAlphaUser).toBe(false);

      expect(() => assertTenantAccess(ctxB, orgA.id)).toThrow('Tenant Isolation Violation');
    });

    it('Tenant Beta cannot update Organization Alpha', async () => {
      await expect(
        organizationService.update(
          orgA.id,
          { name: 'Beta Takeover Attempt' },
          ctxB
        )
      ).rejects.toThrow(AuthorizationError);

      const orgAFresh = await db.organizations.findById(orgA.id);
      expect(orgAFresh?.name).toBe('Tenant Alpha Corp');
    });

    it('Tenant Beta cannot suspend or delete Organization Alpha', async () => {
      await expect(
        organizationService.suspend(orgA.id, 'SUSPENDED', ctxB)
      ).rejects.toThrow(AuthorizationError);
    });

    it('Tenant Beta cannot invite or create a user into Organization Alpha', async () => {
      await expect(
        userService.create(
          {
            email: 'intruder@beta.com',
            name: 'Intruder',
            role: 'EMPLOYEE',
            organization_id: orgA.id,
            password: 'Password123!',
          },
          ctxB
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('Tenant Beta cannot switch organization context to Organization Alpha', async () => {
      await expect(
        authService.switchOrganization(userB.id, orgA.id)
      ).rejects.toThrow(AuthError);
    });
  });
});
