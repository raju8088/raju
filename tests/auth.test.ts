import { describe, it, expect, beforeEach } from 'vitest';
import { authService, AuthError } from '@/services/auth.service';
import { hashPassword, verifyPassword } from '@/lib/utils/crypto';
import { signPayload, verifySessionToken } from '@/lib/auth/session';
import { resetDatabaseForTests } from '@/lib/db';

describe('Authentication & Session Handling', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe('Password Hashing & Crypto', () => {
    it('should hash a password and verify successfully', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toContain(':');
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
    });
  });

  describe('Session Token Sign & Verify', () => {
    it('should sign and verify valid session token', () => {
      const payload = {
        userId: 'd0000000-0000-0000-0000-000000000001',
        currentOrgId: 'c0000000-0000-0000-0000-000000000001',
        role: 'MAIN_ADMIN' as const,
        expiresAt: Date.now() + 60000,
      };

      const token = signPayload(payload);
      const verified = verifySessionToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(payload.userId);
      expect(verified?.currentOrgId).toBe(payload.currentOrgId);
      expect(verified?.role).toBe('MAIN_ADMIN');
    });

    it('should reject tampered session tokens', () => {
      const payload = {
        userId: 'd0000000-0000-0000-0000-000000000001',
        currentOrgId: 'c0000000-0000-0000-0000-000000000001',
        role: 'MAIN_ADMIN' as const,
        expiresAt: Date.now() + 60000,
      };

      const token = signPayload(payload);
      const tampered = token.slice(0, -4) + 'abcd';

      expect(verifySessionToken(tampered)).toBeNull();
    });

    it('should reject expired session tokens', () => {
      const expiredPayload = {
        userId: 'd0000000-0000-0000-0000-000000000001',
        currentOrgId: 'c0000000-0000-0000-0000-000000000001',
        role: 'MAIN_ADMIN' as const,
        expiresAt: Date.now() - 1000, // Expired in the past
      };

      const token = signPayload(expiredPayload);
      expect(verifySessionToken(token)).toBeNull();
    });
  });

  describe('Login Flow', () => {
    it('should allow valid user to log in and return context', async () => {
      const result = await authService.login({
        email: 'admin@voicenuvo.com',
        password: 'Password123!',
      });

      expect(result.user.email).toBe('admin@voicenuvo.com');
      expect(result.role).toBe('MAIN_ADMIN');
      expect(result.token).toBeDefined();
      expect(result.organization).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      await expect(
        authService.login({
          email: 'admin@voicenuvo.com',
          password: 'IncorrectPassword',
        })
      ).rejects.toThrow(AuthError);
    });

    it('should reject login for non-existent user', async () => {
      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(AuthError);
    });
  });

  describe('Registration Flow', () => {
    it('should register a new organization and assign ORG_ADMIN', async () => {
      const result = await authService.register({
        name: 'Sarah Connor',
        email: 'sarah@skynet-defense.com',
        organization_name: 'Cyberdyne Systems',
        password: 'SecurePassword99!',
      });

      expect(result.user.email).toBe('sarah@skynet-defense.com');
      expect(result.organization.name).toBe('Cyberdyne Systems');
      expect(result.organization.slug).toBe('cyberdyne-systems');
      expect(result.member.role).toBe('ORG_ADMIN');
      expect(result.token).toBeDefined();
    });

    it('should prevent registering duplicate email', async () => {
      await expect(
        authService.register({
          name: 'Duplicate Admin',
          email: 'admin@voicenuvo.com', // Already exists
          organization_name: 'Another Company',
          password: 'Password123!',
        })
      ).rejects.toThrow('An account with this email already exists');
    });
  });
});
