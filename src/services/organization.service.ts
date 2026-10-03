import { db } from '@/lib/db';
import { assertTenantAccess, requirePermission } from '@/lib/permissions/rbac';
import { CreateOrganizationInput, UpdateOrganizationInput } from '@/lib/validation/organization.schema';
import { OrgContext, Organization, OrganizationStatus } from '@/types';
import { logger } from '@/lib/utils/logger';
import { organizationRepository } from '@/lib/db/repositories/organization.repository';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';

export const organizationService = {
  /**
   * List organizations permitted for current organization context
   */
  async list(ctx: OrgContext): Promise<Organization[]> {
    requirePermission(ctx, 'ORGANIZATION_VIEW');

    // MAIN_ADMIN can see all organizations
    if (ctx.role === 'MAIN_ADMIN') {
      const all = await db.organizations.list();
      return all.filter((o) => o.status !== 'REMOVED');
    }

    // Other roles can only see organizations where they have active memberships
    const userMemberships = await db.organizationMembers.listByUser(ctx.userId);
    const activeOrgIds = new Set(
      userMemberships.filter((m) => m.status === 'ACTIVE').map((m) => m.organization_id)
    );

    const all = await db.organizations.list();
    return all.filter((o) => activeOrgIds.has(o.id) && o.status !== 'REMOVED');
  },

  /**
   * Get single organization by ID with tenant security check
   */
  async getById(id: string, ctx: OrgContext): Promise<Organization> {
    requirePermission(ctx, 'ORGANIZATION_VIEW');
    assertTenantAccess(ctx, id);

    const org = await db.organizations.findById(id);
    if (!org || org.status === 'REMOVED') {
      throw new OrganizationError('Organization not found', 'ORG_NOT_FOUND', 404);
    }

    return org;
  },

  /**
   * Create a new organization within an ACID transaction (Main Admin only in Phase 1)
   */
  async create(data: CreateOrganizationInput, ctx: OrgContext): Promise<Organization> {
    requirePermission(ctx, 'ORGANIZATION_CREATE');

    // Validate slug uniqueness
    const existing = await db.organizations.findBySlug(data.slug);
    if (existing) {
      throw new OrganizationError('Organization slug is already taken', 'SLUG_TAKEN', 409);
    }

    // Atomic transaction: create organization + assign creator membership + record audit log
    const org = await db.transaction(async (tx) => {
      const createdOrg = await organizationRepository.create(
        {
          name: data.name,
          slug: data.slug,
          logo_url: data.logo_url || null,
          brand_name: data.brand_name || data.name,
          status: 'ACTIVE',
          plan_id: 'standard',
        },
        tx
      );

      await userRepository.createMember(
        {
          organization_id: createdOrg.id,
          user_id: ctx.userId,
          role: ctx.role === 'MAIN_ADMIN' ? 'MAIN_ADMIN' : 'ORG_ADMIN',
          status: 'ACTIVE',
        },
        tx
      );

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: createdOrg.id,
          action: 'ORGANIZATION_CREATE',
          resource_type: 'organization',
          resource_id: createdOrg.id,
          metadata: { name: createdOrg.name, slug: createdOrg.slug },
        },
        tx
      );

      return createdOrg;
    });

    logger.info('organization.created', {
      action: 'ORGANIZATION_CREATE',
      success: true,
      user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
      organization: { id: org.id, slug: org.slug },
    });

    return org;
  },

  /**
   * Update organization details
   */
  async update(id: string, data: UpdateOrganizationInput, ctx: OrgContext): Promise<Organization> {
    requirePermission(ctx, 'ORGANIZATION_UPDATE');
    assertTenantAccess(ctx, id);

    const existing = await db.organizations.findById(id);
    if (!existing || existing.status === 'REMOVED') {
      throw new OrganizationError('Organization not found', 'ORG_NOT_FOUND', 404);
    }

    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await db.organizations.findBySlug(data.slug);
      if (slugConflict && slugConflict.id !== id) {
        throw new OrganizationError('Slug is already in use by another organization', 'SLUG_TAKEN', 409);
      }
    }

    const updated = await db.transaction(async (tx) => {
      const res = await organizationRepository.update(id, data, tx);
      if (!res) {
        throw new OrganizationError('Failed to update organization', 'UPDATE_FAILED', 500);
      }

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: id,
          action: 'ORGANIZATION_UPDATE',
          resource_type: 'organization',
          resource_id: id,
          metadata: { updatedFields: Object.keys(data) },
        },
        tx
      );

      return res;
    });

    logger.info('organization.updated', {
      action: 'ORGANIZATION_UPDATE',
      success: true,
      user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
      organization: { id: updated.id, slug: updated.slug },
    });

    return updated;
  },

  /**
   * Suspend organization (Main Admin only)
   */
  async suspend(id: string, status: OrganizationStatus, ctx: OrgContext): Promise<Organization> {
    requirePermission(ctx, 'ORGANIZATION_SUSPEND');

    const existing = await db.organizations.findById(id);
    if (!existing) {
      throw new OrganizationError('Organization not found', 'ORG_NOT_FOUND', 404);
    }

    const updated = await db.transaction(async (tx) => {
      const res = await organizationRepository.update(id, { status }, tx);
      if (!res) {
        throw new OrganizationError('Failed to suspend organization', 'SUSPEND_FAILED', 500);
      }

      await auditRepository.record(
        {
          actor_user_id: ctx.userId,
          organization_id: id,
          action: 'ORGANIZATION_SUSPEND',
          resource_type: 'organization',
          resource_id: id,
          metadata: { previousStatus: existing.status, newStatus: status },
        },
        tx
      );

      return res;
    });

    logger.info('organization.suspended', {
      action: 'ORGANIZATION_SUSPEND',
      success: true,
      user: { id: ctx.userId, email: ctx.user.email, role: ctx.role },
      organization: { id: updated.id, slug: updated.slug },
      metadata: { newStatus: status },
    });

    return updated;
  },
};

export class OrganizationError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'OrganizationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
