import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasPermission,
  requirePermission,
  assertTenantAccess,
  AuthorizationError,
} from '@/lib/permissions/rbac';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';
import { OrgContext, RoleType } from '@/types';
import { resetDatabaseForTests } from '@/lib/db';

function mockContext(role: RoleType, orgId: string): OrgContext {
  return {
    userId: 'mock-user-id',
    organizationId: orgId,
    role,
    permissions: ROLE_PERMISSIONS[role],
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    organization: {
      id: orgId,
      name: 'Mock Org',
      slug: 'mock-org',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

describe('Authorization & RBAC & Tenant Isolation', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe('Role-Permission Matrix', () => {
    it('MAIN_ADMIN should have all platform permissions', () => {
      const adminCtx = mockContext('MAIN_ADMIN', 'org-1');
      expect(hasPermission(adminCtx, 'ORGANIZATION_CREATE')).toBe(true);
      expect(hasPermission(adminCtx, 'ORGANIZATION_SUSPEND')).toBe(true);
      expect(hasPermission(adminCtx, 'USER_DELETE')).toBe(true);
      expect(hasPermission(adminCtx, 'DASHBOARD_VIEW')).toBe(true);
    });

    it('ORG_ADMIN should have org-level permissions but NOT global platform permissions', () => {
      const orgAdminCtx = mockContext('ORG_ADMIN', 'org-1');
      expect(hasPermission(orgAdminCtx, 'ORGANIZATION_VIEW')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'ORGANIZATION_UPDATE')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'USER_CREATE')).toBe(true);
      // Cannot create or suspend child organizations
      expect(hasPermission(orgAdminCtx, 'ORGANIZATION_CREATE')).toBe(false);
      expect(hasPermission(orgAdminCtx, 'ORGANIZATION_SUSPEND')).toBe(false);
    });

    it('EMPLOYEE should have read permissions but NOT admin mutations', () => {
      const employeeCtx = mockContext('EMPLOYEE', 'org-1');
      expect(hasPermission(employeeCtx, 'DASHBOARD_VIEW')).toBe(true);
      expect(hasPermission(employeeCtx, 'ORGANIZATION_VIEW')).toBe(true);
      expect(hasPermission(employeeCtx, 'USER_VIEW')).toBe(true);
      // Denied
      expect(hasPermission(employeeCtx, 'ORGANIZATION_UPDATE')).toBe(false);
      expect(hasPermission(employeeCtx, 'USER_CREATE')).toBe(false);
      expect(hasPermission(employeeCtx, 'USER_DELETE')).toBe(false);
      expect(hasPermission(employeeCtx, 'ORGANIZATION_CREATE')).toBe(false);
      expect(hasPermission(employeeCtx, 'ORGANIZATION_SUSPEND')).toBe(false);
    });

    it('requirePermission should throw AuthorizationError when permission is missing', () => {
      const employeeCtx = mockContext('EMPLOYEE', 'org-1');
      expect(() => requirePermission(employeeCtx, 'ORGANIZATION_CREATE')).toThrow(
        AuthorizationError
      );
    });
  });

  describe('Tenant Isolation Enforcement', () => {
    it('should reject non-admin user trying to access another organization data', () => {
      const orgAContext = mockContext('ORG_ADMIN', 'org-tenant-a');
      const targetOrgB = 'org-tenant-b';

      expect(() => assertTenantAccess(orgAContext, targetOrgB)).toThrow(
        'Tenant Isolation Violation'
      );
    });

    it('should allow user accessing their own organization data', () => {
      const orgAContext = mockContext('ORG_ADMIN', 'org-tenant-a');
      expect(() => assertTenantAccess(orgAContext, 'org-tenant-a')).not.toThrow();
    });

    it('MAIN_ADMIN should have global oversight across tenant organizations', () => {
      const mainAdminContext = mockContext('MAIN_ADMIN', 'org-platform');
      expect(() => assertTenantAccess(mainAdminContext, 'org-tenant-a')).not.toThrow();
      expect(() => assertTenantAccess(mainAdminContext, 'org-tenant-b')).not.toThrow();
    });
  });
});
