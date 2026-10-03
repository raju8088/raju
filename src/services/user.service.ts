import { db } from '@/lib/db';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { hashPassword } from '@/lib/utils/crypto';
import { CreateUserInput, UpdateMemberInput } from '@/lib/validation/user.schema';
import { OrgContext, OrganizationMember } from '@/types';
import { logger } from '@/lib/utils/logger';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';

export const userService = {
  /**
   * List users/members in current organization context
   */
  async list(ctx: OrgContext): Promise<OrganizationMember[]> {
    requirePermission(ctx, 'USER_VIEW');

    // MAIN_ADMIN can view all members or filter by active org
    if (ctx.role === 'MAIN_ADMIN' && ctx.organizationId === 'c0000000-0000-0000-0000-000000000001') {
      const allOrgs = await db.organizations.list();
      const allMembers: OrganizationMember[] = [];
      for (const org of allOrgs) {
        const members = await db.organizationMembers.listByOrg(org.id);
        allMembers.push(...members);
      }
      return allMembers;
    }

    // Tenant scoped: only current organization members
    return db.organizationMembers.listByOrg(ctx.organizationId);
  },

  /**
   * Get member by ID with tenant security check
   */
  async getMemberById(memberId: string, ctx: OrgContext): Promise<OrganizationMember> {
    requirePermission(ctx, 'USER_VIEW');

    const member = await db.organizationMembers.findById(memberId);
    if (!member) {
      throw new UserError('Organization member not found', 'MEMBER_NOT_FOUND', 404);
    }

    if (ctx.role !== 'MAIN_ADMIN' && member.organization_id !== ctx.organizationId) {
      throw new UserError('Access denied: User belongs to another organization', 'TENANT_VIOLATION', 403);
    }

    return member;
  },

  /**
   * Create or invite a user to the organization within an atomic transaction
   */
  async create(data: CreateUserInput, ctx: OrgContext): Promise<OrganizationMember> {
    requirePermission(ctx, 'USER_CREATE');

    // Role assignment security:
    // Only MAIN_ADMIN can assign MAIN_ADMIN role
    if (data.role === 'MAIN_ADMIN' && ctx.role !== 'MAIN_ADMIN') {
      throw new UserError('Only Main Admins can create Main Admin accounts', 'INSUFFICIENT_PRIVILEGES', 403);
    }

    // Enforce tenant isolation:
    // If target organization is requested and differs from caller's organization,
    // only MAIN_ADMIN may create users in another organization.
    const requestedOrgId = data.organization_id || (data as { organizationId?: string }).organizationId;
    if (requestedOrgId && requestedOrgId !== ctx.organizationId && ctx.role !== 'MAIN_ADMIN') {
      throw new AuthorizationError(
        `Tenant Isolation Violation: Cannot create user in organization ${requestedOrgId}`,
        'TENANT_ACCESS_DENIED',
        403
      );
    }

    const targetOrgId = ctx.role === 'MAIN_ADMIN' && requestedOrgId
      ? requestedOrgId
      : ctx.organizationId;

    const normalizedEmail = data.email.toLowerCase().trim();

    return db.transaction(async (tx) => {
      // Check if user already exists
      let user = await userRepository.findByEmail(normalizedEmail, tx);

      if (!user) {
        const passwordHash = await hashPassword(data.password || 'Password123!');
        user = await userRepository.create(
          {
            email: normalizedEmail,
            name: data.name.trim(),
            phone: data.phone || null,
            auth_provider_id: null,
            password_hash: passwordHash,
            status: 'ACTIVE',
          },
          tx
        );
      }

      // Check if membership already exists in target organization
      const existingMembership = await userRepository.findMemberByOrgAndUser(targetOrgId, user.id, tx);
      if (existingMembership) {
        throw new UserError('User is already a member of this organization', 'ALREADY_MEMBER', 409);
      }

      const member = await userRepository.createMember(
        {
          organization_id: targetOrgId,
          user_id: user.id,
          role: data.role,
          status: 'ACTIVE',
        },
        tx
      );

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: targetOrgId,
          action: 'MEMBER_INVITED',
          resource_type: 'user',
          resource_id: user.id,
          metadata: { email: user.email, role: data.role },
        },
        tx
      );

      logger.info('user.created_in_org', {
        action: 'USER_CREATE',
        success: true,
        user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
        organization: { id: targetOrgId },
        metadata: { targetUserId: user.id, assignedRole: data.role },
      });

      return member;
    });
  },

  /**
   * Update member role or status within an atomic transaction
   */
  async updateMember(memberId: string, data: UpdateMemberInput, ctx: OrgContext): Promise<OrganizationMember> {
    requirePermission(ctx, 'USER_UPDATE');

    const member = await db.organizationMembers.findById(memberId);
    if (!member) {
      throw new UserError('Organization member not found', 'MEMBER_NOT_FOUND', 404);
    }

    if (ctx.role !== 'MAIN_ADMIN' && member.organization_id !== ctx.organizationId) {
      throw new UserError('Access denied: Member belongs to another organization', 'TENANT_VIOLATION', 403);
    }

    if (data.role === 'MAIN_ADMIN' && ctx.role !== 'MAIN_ADMIN') {
      throw new UserError('Only Main Admins can promote to Main Admin', 'INSUFFICIENT_PRIVILEGES', 403);
    }

    // Safeguard: Root Main Admin cannot be demoted
    if (member.id === 'e0000000-0000-0000-0000-000000000001' && data.role && data.role !== 'MAIN_ADMIN') {
      throw new UserError('Root Main Administrator role cannot be demoted', 'CANNOT_DEMOTE_ROOT_ADMIN', 400);
    }

    return db.transaction(async (tx) => {
      const updated = await userRepository.updateMember(memberId, data, tx);
      if (!updated) {
        throw new UserError('Failed to update member', 'UPDATE_FAILED', 500);
      }

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: member.organization_id,
          action: 'ROLE_CHANGED',
          resource_type: 'organization_member',
          resource_id: memberId,
          metadata: { previousRole: member.role, newRole: data.role },
        },
        tx
      );

      logger.info('user.member_updated', {
        action: 'USER_UPDATE',
        success: true,
        user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
        organization: { id: member.organization_id },
        metadata: { targetMemberId: memberId, ...data },
      });

      return updated;
    });
  },

  /**
   * Remove member from organization
   */
  async removeMember(memberId: string, ctx: OrgContext): Promise<boolean> {
    requirePermission(ctx, 'USER_DELETE');

    const member = await db.organizationMembers.findById(memberId);
    if (!member) {
      throw new UserError('Organization member not found', 'MEMBER_NOT_FOUND', 404);
    }

    if (ctx.role !== 'MAIN_ADMIN' && member.organization_id !== ctx.organizationId) {
      throw new UserError('Access denied: Member belongs to another organization', 'TENANT_VIOLATION', 403);
    }

    // Prevent removing the root platform Main Admin or self removal
    if (member.id === 'e0000000-0000-0000-0000-000000000001') {
      throw new UserError('Root Main Administrator cannot be removed', 'CANNOT_REMOVE_ROOT_ADMIN', 400);
    }

    if (member.user_id === ctx.userId) {
      throw new UserError('Cannot remove yourself from the organization', 'SELF_REMOVAL_NOT_ALLOWED', 400);
    }

    await db.transaction(async (tx) => {
      await userRepository.deleteMember(memberId, tx);

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: member.organization_id,
          action: 'MEMBER_REMOVED',
          resource_type: 'organization_member',
          resource_id: memberId,
          metadata: { removedUserId: member.user_id },
        },
        tx
      );
    });

    logger.info('user.member_removed', {
      action: 'USER_DELETE',
      success: true,
      user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
      organization: { id: member.organization_id },
      metadata: { removedMemberId: memberId },
    });

    return true;
  },
};

export class UserError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
