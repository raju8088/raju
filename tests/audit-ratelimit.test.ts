import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabaseForTests } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { organizationService } from '@/services/organization.service';
import { rateLimitRepository } from '@/lib/db/repositories/rate-limit.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';
import { OrgContext } from '@/types';

describe('Audit Logging & Abuse Protection (Rate Limiting)', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe('Audit Logging Foundation', () => {
    it('records structured audit logs on user registration, login, org update, and logout', async () => {
      // 1. Register a new user and organization
      const reg = await authService.register({
        name: 'Audit Actor',
        email: 'audit@example.com',
        organization_name: 'Audit Security Corp',
        password: 'Password123!',
      });

      // Check audit log for registration
      const regLogs = await auditRepository.listByOrg(reg.organization.id);
      expect(regLogs.length).toBeGreaterThanOrEqual(1);

      const regEntry = regLogs.find((l) => l.action === 'AUTH_REGISTER');
      expect(regEntry).toBeDefined();
      expect(regEntry?.actor_user_id).toBe(reg.user.id);
      expect(regEntry?.resource_type).toBe('organization');
      expect(regEntry?.resource_id).toBe(reg.organization.id);
      expect(regEntry?.metadata).toHaveProperty('organizationName', 'Audit Security Corp');
      // Critical check: Ensure NO passwords or secret hashes are in audit metadata
      expect(JSON.stringify(regEntry?.metadata)).not.toContain('Password123!');
      expect(JSON.stringify(regEntry?.metadata)).not.toContain('password_hash');

      // 2. Login as the newly created user
      await authService.login({
        email: 'audit@example.com',
        password: 'Password123!',
      });

      const loginLogs = await auditRepository.listByUser(reg.user.id);
      const loginEntry = loginLogs.find((l) => l.action === 'AUTH_LOGIN');
      expect(loginEntry).toBeDefined();
      expect(loginEntry?.actor_user_id).toBe(reg.user.id);

      // 3. Organization update audit log
      const ctx: OrgContext = {
        userId: reg.user.id,
        organizationId: reg.organization.id,
        role: 'ORG_ADMIN',
        permissions: ROLE_PERMISSIONS['ORG_ADMIN'],
        user: reg.user,
        organization: reg.organization,
      };

      await organizationService.update(
        reg.organization.id,
        { brand_name: 'Updated Brand' },
        ctx
      );

      const updateLogs = await auditRepository.listByOrg(reg.organization.id);
      const updateEntry = updateLogs.find((l) => l.action === 'ORGANIZATION_UPDATE');
      expect(updateEntry).toBeDefined();
      expect(updateEntry?.actor_user_id).toBe(reg.user.id);

      // 4. Logout audit log
      await authService.logout(reg.user.id, reg.organization.id, '127.0.0.1');
      const logoutLogs = await auditRepository.listByUser(reg.user.id);
      const logoutEntry = logoutLogs.find((l) => l.action === 'AUTH_LOGOUT');
      expect(logoutEntry).toBeDefined();
      expect(logoutEntry?.ip_address).toBe('127.0.0.1');
    });
  });

  describe('Abuse Protection & Rate Limiting', () => {
    it('enforces atomic rate limits on consecutive failed login attempts and triggers 429', async () => {
      const email = 'victim@example.com';
      const rateLimitKey = `login:${email}`;

      // Reset any previous state for key
      await rateLimitRepository.reset(rateLimitKey);

      // Attempt 5 failed logins (allowed limit is 5 in 15 minutes)
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.login({
            email,
            password: 'WrongPassword!',
          })
        ).rejects.toThrow('Invalid email or password');
      }

      // The 6th attempt should be blocked by rate limiting with HTTP 429 RATE_LIMITED
      await expect(
        authService.login({
          email,
          password: 'WrongPassword!',
        })
      ).rejects.toThrow('Too many failed login attempts');

      // Manual reset clears the limit
      await rateLimitRepository.reset(rateLimitKey);
      const checkAfterReset = await rateLimitRepository.checkAndConsume(rateLimitKey, 5, 900);
      expect(checkAfterReset.allowed).toBe(true);
      expect(checkAfterReset.attempts).toBe(1);
    });
  });
});
