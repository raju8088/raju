import { logger } from '@/lib/utils/logger';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl?: string;
  sessionSecret: string;
  isProduction: boolean;
  appUrl: string;
  seedDemoData: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates environment configuration at startup.
 * Enforces production safety rules and fails fast if critical secrets are absent or weak.
 */
export function validateEnvironment(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const isProduction = nodeEnv === 'production';
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sessionSecret = (process.env.SESSION_SECRET || process.env.AUTH_SECRET || '').trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const seedDemoData = process.env.SEED_DEMO_DATA === 'true';

  if (isProduction) {
    // 1. DATABASE_URL is strictly mandatory in production
    if (!databaseUrl) {
      const err = new ConfigurationError(
        'CRITICAL STARTUP ERROR: DATABASE_URL environment variable is required in production mode. Fallback to in-memory/local storage is forbidden.'
      );
      logger.error('config.validation_failed', { action: 'CONFIG_VALIDATE', error: err.message });
      throw err;
    }

    if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
      const err = new ConfigurationError(
        'CRITICAL STARTUP ERROR: DATABASE_URL must start with "postgresql://" or "postgres://".'
      );
      logger.error('config.validation_failed', { action: 'CONFIG_VALIDATE', error: err.message });
      throw err;
    }

    // 2. SESSION_SECRET must be strong in production (minimum 32 characters)
    if (!sessionSecret) {
      const err = new ConfigurationError(
        'CRITICAL STARTUP ERROR: SESSION_SECRET (or AUTH_SECRET) is required in production mode.'
      );
      logger.error('config.validation_failed', { action: 'CONFIG_VALIDATE', error: err.message });
      throw err;
    }

    if (sessionSecret.length < 32) {
      const err = new ConfigurationError(
        'CRITICAL STARTUP ERROR: SESSION_SECRET must be at least 32 characters long for cryptographic integrity.'
      );
      logger.error('config.validation_failed', { action: 'CONFIG_VALIDATE', error: err.message });
      throw err;
    }

    if (sessionSecret.includes('voicenuvo-phase1-dev') || sessionSecret.includes('32chars')) {
      const err = new ConfigurationError(
        'CRITICAL STARTUP ERROR: Default development SESSION_SECRET cannot be used in production.'
      );
      logger.error('config.validation_failed', { action: 'CONFIG_VALIDATE', error: err.message });
      throw err;
    }
  }

  return {
    nodeEnv,
    databaseUrl,
    sessionSecret: sessionSecret || 'voicenuvo-phase2-prod-session-secret-key-32chars',
    isProduction,
    appUrl,
    seedDemoData,
  };
}
