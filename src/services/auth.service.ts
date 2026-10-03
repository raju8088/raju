import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/utils/crypto';
import { slugify } from '@/lib/utils/slug';
import { signPayload, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';
import { LoginInput, RegisterInput } from '@/lib/validation/auth.schema';
import { OrgContext, RoleType, SessionPayload, User, Organization, OrganizationMember } from '@/types';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';
import { logger } from '@/lib/utils/logger';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { organizationRepository } from '@/lib/db/repositories/organization.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { rateLimitRepository } from '@/lib/db/repositories/rate-limit.repository';

export const authService = {
  /**
   * Authenticate user with credentials, apply rate limiting, and issue session
   */
  async login(
    data: LoginInput,
    ipAddress?: string
  ): Promise<{
    user: User;
    organization: Organization;
    role: RoleType;
    token: string;
    context: OrgContext;
  }> {
    const normalizedEmail = data.email.toLowerCase().trim();
    const rateLimitKey = `login:${normalizedEmail}`;

    // Abuse protection: 5 attempts per 15 minutes
    const rateCheck = await rateLimitRepository.checkAndConsume(rateLimitKey, 5, 900);
    if (!rateCheck.allowed) {
      logger.warn('auth.rate_limited', {
        action: 'LOGIN',
        success: false,
        errorCode: 'RATE_LIMITED',
        metadata: { email: normalizedEmail, ipAddress },
      });
      throw new AuthError('Too many failed login attempts. Please try again in 15 minutes.', 'RATE_LIMITED', 429);
    }

    const user = await db.users.findByEmail(normalizedEmail);
    if (!user) {
      logger.warn('auth.login_failed', {
        action: 'LOGIN',
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        metadata: { email: normalizedEmail },
      });
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthError('Account is suspended or inactive', 'ACCOUNT_INACTIVE', 403);
    }

    // Verify password hash
    if (!user.password_hash) {
      throw new AuthError('Password login not enabled for this account', 'AUTH_METHOD_NOT_SUPPORTED', 400);
    }

    const isValid = await verifyPassword(data.password, user.password_hash);
    if (!isValid) {
      logger.warn('auth.login_failed', {
        action: 'LOGIN',
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        user: { id: user.id, email: user.email },
      });
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // Login succeeded: reset rate limit counter
    await rateLimitRepository.reset(rateLimitKey);

    // Retrieve active memberships
    const memberships = await db.organizationMembers.listByUser(user.id);
    const activeMembers = memberships.filter((m) => m.status === 'ACTIVE');

    if (activeMembers.length === 0) {
      throw new AuthError('No active organizations associated with this account', 'NO_ACTIVE_ORGS', 403);
    }

    // Choose default organization (first active, prioritizing MAIN_ADMIN or ORG_ADMIN)
    const primaryMember =
      activeMembers.find((m) => m.role === 'MAIN_ADMIN') ||
      activeMembers.find((m) => m.role === 'ORG_ADMIN') ||
      activeMembers[0];

    const organization = await db.organizations.findById(primaryMember.organization_id);
    if (!organization || organization.status === 'REMOVED' || organization.status === 'BIN') {
      throw new AuthError('Default organization is inactive or removed', 'ORG_INACTIVE', 403);
    }

    const role = primaryMember.role;
    const permissions = ROLE_PERMISSIONS[role] || [];

    const sessionPayload: SessionPayload = {
      userId: user.id,
      currentOrgId: organization.id,
      role,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };

    const token = signPayload(sessionPayload);

    // Record audit event
    await auditRepository.record({
      actor_user_id: user.id,
      organization_id: organization.id,
      action: 'AUTH_LOGIN',
      resource_type: 'session',
      ip_address: ipAddress || null,
      metadata: { role },
    });

    logger.info('auth.login_success', {
      action: 'LOGIN',
      success: true,
      user: { id: user.id, email: user.email, role },
      organization: { id: organization.id, slug: organization.slug },
    });

    const context: OrgContext = {
      userId: user.id,
      organizationId: organization.id,
      role,
      permissions,
      user,
      organization,
    };

    return {
      user,
      organization,
      role,
      token,
      context,
    };
  },

  /**
   * Register a new user and bootstrap their initial organization in an atomic PostgreSQL transaction
   */
  async register(
    data: RegisterInput,
    ipAddress?: string
  ): Promise<{
    user: User;
    organization: Organization;
    member: OrganizationMember;
    token: string;
    context: OrgContext;
  }> {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check rate limit for registrations from this IP
    if (ipAddress) {
      const regCheck = await rateLimitRepository.checkAndConsume(`register_ip:${ipAddress}`, 10, 3600);
      if (!regCheck.allowed) {
        throw new AuthError('Too many registration requests. Please try again later.', 'RATE_LIMITED', 429);
      }
    }

    const existing = await db.users.findByEmail(normalizedEmail);
    if (existing) {
      throw new AuthError('An account with this email already exists', 'EMAIL_TAKEN', 409);
    }

    // Generate unique slug
    let baseSlug = slugify(data.organization_name);
    if (!baseSlug) baseSlug = 'org';
    let slug = baseSlug;
    let counter = 1;

    while (await db.organizations.findBySlug(slug)) {
      slug = `${baseSlug}-${counter++}`;
    }

    const passwordHash = await hashPassword(data.password);

    // Execute within atomic PostgreSQL transaction
    const { user, organization, member } = await db.transaction(async (tx) => {
      // 1. Create User
      const newUser = await userRepository.create(
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

      // 2. Create Organization
      const newOrg = await organizationRepository.create(
        {
          name: data.organization_name.trim(),
          slug,
          logo_url: null,
          brand_name: data.organization_name.trim(),
          status: 'ACTIVE',
          plan_id: 'starter',
        },
        tx
      );

      // 3. Create Membership as ORG_ADMIN
      const newMember = await userRepository.createMember(
        {
          organization_id: newOrg.id,
          user_id: newUser.id,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
        },
        tx
      );

      // 4. Record audit log inside transaction
      await auditRepository.record(
        {
          actor_user_id: newUser.id,
          organization_id: newOrg.id,
          action: 'AUTH_REGISTER',
          resource_type: 'organization',
          resource_id: newOrg.id,
          ip_address: ipAddress || null,
          metadata: { organizationName: newOrg.name, slug: newOrg.slug },
        },
        tx
      );

      return { user: newUser, organization: newOrg, member: newMember };
    });

    const role: RoleType = 'ORG_ADMIN';
    const permissions = ROLE_PERMISSIONS[role] || [];

    const sessionPayload: SessionPayload = {
      userId: user.id,
      currentOrgId: organization.id,
      role,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };

    const token = signPayload(sessionPayload);

    logger.info('auth.register_success', {
      action: 'REGISTER',
      success: true,
      user: { id: user.id, email: user.email, role },
      organization: { id: organization.id, slug: organization.slug },
    });

    const context: OrgContext = {
      userId: user.id,
      organizationId: organization.id,
      role,
      permissions,
      user,
      organization,
    };

    return {
      user,
      organization,
      member,
      token,
      context,
    };
  },

  /**
   * Switch the active organization context for the user
   */
  async switchOrganization(
    userId: string,
    targetOrgId: string,
    ipAddress?: string
  ): Promise<{
    token: string;
    organization: Organization;
    role: RoleType;
  }> {
    const user = await db.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthError('Unauthorized', 'UNAUTHORIZED', 401);
    }

    const memberships = await db.organizationMembers.listByUser(userId);
    const isGlobalAdmin = memberships.some((m) => m.role === 'MAIN_ADMIN' && m.status === 'ACTIVE');

    const targetOrg = await db.organizations.findById(targetOrgId);
    if (!targetOrg || targetOrg.status === 'REMOVED' || targetOrg.status === 'BIN') {
      throw new AuthError('Target organization not found or inactive', 'ORG_NOT_FOUND', 404);
    }

    let role: RoleType;
    if (isGlobalAdmin) {
      role = 'MAIN_ADMIN';
    } else {
      const membership = memberships.find((m) => m.organization_id === targetOrgId && m.status === 'ACTIVE');
      if (!membership) {
        throw new AuthError('Access denied: You are not a member of this organization', 'FORBIDDEN', 403);
      }
      role = membership.role;
    }

    const sessionPayload: SessionPayload = {
      userId: user.id,
      currentOrgId: targetOrg.id,
      role,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };

    const token = signPayload(sessionPayload);

    await auditRepository.record({
      actor_user_id: user.id,
      organization_id: targetOrg.id,
      action: 'AUTH_SWITCH_ORG',
      resource_type: 'organization',
      resource_id: targetOrg.id,
      ip_address: ipAddress || null,
      metadata: { targetOrgId, assignedRole: role },
    });

    logger.info('auth.switch_org', {
      action: 'SWITCH_ORG',
      success: true,
      user: { id: user.id, email: user.email, role },
      organization: { id: targetOrg.id, slug: targetOrg.slug },
    });

    return {
      token,
      organization: targetOrg,
      role,
    };
  },

  /**
   * Log an audit event for logout
   */
  async logout(userId?: string, organizationId?: string, ipAddress?: string): Promise<void> {
    if (userId) {
      await auditRepository.record({
        actor_user_id: userId,
        organization_id: organizationId || null,
        action: 'AUTH_LOGOUT',
        resource_type: 'user',
        resource_id: userId,
        ip_address: ipAddress || null,
        metadata: {},
      });
    }
  },
};

export class AuthError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
