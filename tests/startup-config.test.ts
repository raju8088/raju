import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnvironment, ConfigurationError } from '@/lib/config/env';
import { getDatabaseDriver } from '@/lib/db/client';

describe('Production Startup Validation & Driver Selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset global driver singleton before each test
    globalThis.__voicenuvo_db_instance = undefined;
    globalThis.__voicenuvo_db_ready = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.__voicenuvo_db_instance = undefined;
    globalThis.__voicenuvo_db_ready = undefined;
  });

  describe('Production Environment Guardrails (Fail-Fast)', () => {
    it('throws ConfigurationError in production if DATABASE_URL is missing, forbidding silent PGlite fallback', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      process.env.SESSION_SECRET = 'a-super-long-secure-random-production-secret-1234567890!';

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow(/DATABASE_URL environment variable is required/);
    });

    it('throws ConfigurationError in production if DATABASE_URL is not a valid postgresql:// URI', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/db';
      process.env.SESSION_SECRET = 'a-super-long-secure-random-production-secret-1234567890!';

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow(/DATABASE_URL must start with "postgresql:\/\/" or "postgres:\/\/"/);
    });

    it('throws ConfigurationError in production if SESSION_SECRET is missing or too short', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/postgres';
      delete process.env.SESSION_SECRET;
      delete process.env.AUTH_SECRET;

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow(/SESSION_SECRET.*is required/);

      // Short secret
      process.env.SESSION_SECRET = 'short-secret';
      expect(() => validateEnvironment()).toThrow(/SESSION_SECRET must be at least 32 characters/);
    });

    it('rejects default development SESSION_SECRET in production', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/postgres';
      process.env.SESSION_SECRET = 'voicenuvo-phase1-dev-session-secret-key-32chars';

      expect(() => validateEnvironment()).toThrow(/Default development SESSION_SECRET cannot be used in production/);
    });

    it('passes validation in production when strong credentials are provided', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@db.supabase.co:5432/postgres';
      process.env.SESSION_SECRET = 'super-secure-production-random-token-secret-987654321!';

      const config = validateEnvironment();
      expect(config.isProduction).toBe(true);
      expect(config.databaseUrl).toBe('postgresql://postgres:pass@db.supabase.co:5432/postgres');
      expect(config.sessionSecret).toBe('super-secure-production-random-token-secret-987654321!');
    });

    it('Test A: selects driver = postgres when in production with valid DATABASE_URL', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@db.supabase.co:5432/postgres';
      process.env.SESSION_SECRET = 'super-secure-production-random-token-secret-987654321!';

      const driver = getDatabaseDriver();
      expect(driver.type).toBe('postgres');
    });

    it('Test B: getDatabaseDriver() refuses to initialize PGlite when NODE_ENV is production and DATABASE_URL is missing', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      process.env.SESSION_SECRET = 'super-secure-production-random-token-secret-987654321!';

      expect(() => getDatabaseDriver()).toThrow(ConfigurationError);
    });
  });

  describe('Development & Test Driver Selection', () => {
    it('uses PGlite driver in development when DATABASE_URL is unset', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.DATABASE_URL;

      const driver = getDatabaseDriver();
      expect(driver.type).toBe('pglite');
    });

    it('uses postgres pool driver when valid DATABASE_URL is provided in development', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/testdb';

      const driver = getDatabaseDriver();
      expect(driver.type).toBe('postgres');
    });
  });
});
