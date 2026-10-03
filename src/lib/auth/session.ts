import { cookies } from 'next/headers';
import { db } from '../db';
import { OrgContext, RoleType, SessionPayload, User, Organization } from '@/types';
import { ROLE_PERMISSIONS } from '../permissions/permissions';
import { signPayload, verifySessionToken, SESSION_COOKIE_NAME } from './token';

export { signPayload, verifySessionToken, SESSION_COOKIE_NAME };

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Read session cookie and return validated payload
 */
export async function getSessionPayload(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) {
      return null;
    }
    return verifySessionToken(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<User | null> {
  const payload = await getSessionPayload();
  if (!payload?.userId) return null;

  const user = await db.users.findById(payload.userId);
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }
  return user;
}

/**
 * Get current active organization
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  const payload = await getSessionPayload();
  if (!payload?.currentOrgId) return null;

  const org = await db.organizations.findById(payload.currentOrgId);
  if (!org || org.status === 'REMOVED' || org.status === 'BIN') {
    return null;
  }
  return org;
}

/**
 * Resolve full Organization Context for the request
 */
export async function getOrganizationContext(): Promise<OrgContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const payload = await getSessionPayload();
  const orgId = payload?.currentOrgId;

  // Find user memberships
  const memberships = await db.organizationMembers.listByUser(user.id);
  const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

  if (activeMemberships.length === 0) {
    return null;
  }

  // If user requested a specific org, verify they belong or are MAIN_ADMIN
  let activeMember = orgId
    ? activeMemberships.find((m) => m.organization_id === orgId)
    : activeMemberships[0];

  const isMainAdmin = activeMemberships.some((m) => m.role === 'MAIN_ADMIN');

  // If user is MAIN_ADMIN and requested org is valid, allow context switch even if not explicitly a member row
  if (isMainAdmin && orgId && !activeMember) {
    const requestedOrg = await db.organizations.findById(orgId);
    if (requestedOrg) {
      const permissions = ROLE_PERMISSIONS['MAIN_ADMIN'];
      return {
        userId: user.id,
        organizationId: requestedOrg.id,
        role: 'MAIN_ADMIN',
        permissions,
        user,
        organization: requestedOrg,
      };
    }
  }

  if (!activeMember) {
    activeMember = activeMemberships[0];
  }

  const organization = await db.organizations.findById(activeMember.organization_id);
  if (!organization || organization.status === 'REMOVED' || organization.status === 'BIN') {
    return null;
  }

  const role: RoleType = activeMember.role;
  const permissions = ROLE_PERMISSIONS[role] || [];

  return {
    userId: user.id,
    organizationId: organization.id,
    role,
    permissions,
    user,
    organization,
  };
}

/**
 * Set session cookie in response
 */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = signPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clear session cookie upon logout
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_MAX_AGE_SECONDS };
