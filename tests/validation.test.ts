import { describe, it, expect } from 'vitest';
import { createOrganizationSchema } from '@/lib/validation/organization.schema';
import { createUserSchema } from '@/lib/validation/user.schema';
import { loginSchema, registerSchema } from '@/lib/validation/auth.schema';

describe('Zod Schema Validation', () => {
  describe('Organization Validation', () => {
    it('accepts valid organization input', () => {
      const valid = {
        name: 'Acme Telephony',
        slug: 'acme-telephony',
        brand_name: 'Acme Voice',
      };
      expect(() => createOrganizationSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid slugs with uppercase or special characters', () => {
      const invalid = {
        name: 'Acme Telephony',
        slug: 'Acme_Telephony!',
      };
      expect(() => createOrganizationSchema.parse(invalid)).toThrow();
    });

    it('rejects too short organization name', () => {
      const invalid = {
        name: 'A',
        slug: 'a-org',
      };
      expect(() => createOrganizationSchema.parse(invalid)).toThrow();
    });
  });

  describe('User Validation', () => {
    it('accepts valid user input', () => {
      const valid = {
        email: 'user@example.com',
        name: 'Jane Doe',
        phone: '+12025550199',
        role: 'EMPLOYEE' as const,
      };
      expect(() => createUserSchema.parse(valid)).not.toThrow();
    });

    it('rejects malformed email address', () => {
      const invalid = {
        email: 'invalid-email-address',
        name: 'Jane Doe',
      };
      expect(() => createUserSchema.parse(invalid)).toThrow();
    });
  });

  describe('Auth Validation', () => {
    it('validates login requires email and password', () => {
      expect(() => loginSchema.parse({ email: 'test@example.com', password: '' })).toThrow();
      expect(() =>
        loginSchema.parse({ email: 'test@example.com', password: 'Password123!' })
      ).not.toThrow();
    });

    it('validates register requires at least 6 char password', () => {
      expect(() =>
        registerSchema.parse({
          name: 'Bob',
          email: 'bob@example.com',
          organization_name: 'Bob Corp',
          password: '123', // too short
        })
      ).toThrow();
    });
  });
});
