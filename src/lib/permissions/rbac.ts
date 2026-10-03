import { OrgContext, PermissionKey, RoleType } from '@/types';
import { ROLE_PERMISSIONS } from './permissions';

/**
 * Check if a role possesses a specific permission
 */
export function roleHasPermission(role: RoleType, permission: PermissionKey): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Check if the active organization context has a specific permission
 */
export function hasPermission(ctx: Pick<OrgContext, 'role' | 'permissions'> | RoleType, permission: PermissionKey): boolean {
  if (typeof ctx === 'string') {
    return roleHasPermission(ctx, permission);
  }
  if (Array.isArray(ctx.permissions)) {
    return ctx.permissions.includes(permission);
  }
  return roleHasPermission(ctx.role, permission);
}

/**
 * Assert that the context has the requested permission, throws if not
 */
export function requirePermission(ctx: Pick<OrgContext, 'role' | 'permissions'> | RoleType, permission: PermissionKey): void {
  if (!hasPermission(ctx, permission)) {
    throw new AuthorizationError(
      `Forbidden: Missing required permission '${permission}'`,
      'FORBIDDEN'
    );
  }
}

/**
 * Tenant Isolation Assertion:
 * MAIN_ADMIN can operate globally across organizations.
 * Other roles (ORG_ADMIN, EMPLOYEE) can ONLY operate within their authenticated organizationId.
 */
export function assertTenantAccess(
  ctx: Pick<OrgContext, 'role' | 'organizationId'>,
  targetOrganizationId: string
): void {
  if (ctx.role === 'MAIN_ADMIN') {
    return; // Main Admin has cross-tenant oversight
  }

  if (!ctx.organizationId || ctx.organizationId !== targetOrganizationId) {
    throw new AuthorizationError(
      'Tenant Isolation Violation: Access to this organization is strictly unauthorized',
      'TENANT_ACCESS_DENIED'
    );
  }
}

export class AuthorizationError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = 'FORBIDDEN', statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
