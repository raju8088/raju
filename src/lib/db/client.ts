import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { logger } from '../utils/logger';

import { validateEnvironment } from '@/lib/config/env';

export interface QueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec?(sql: string): Promise<void>;
}

export interface TransactionClient extends QueryClient {
  isTransaction: true;
}

export interface DatabaseDriver {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec?(sql: string): Promise<void>;
  transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
  withUserContext?<T>(userId: string, fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  type: 'postgres' | 'pglite';
}

declare global {
  var __voicenuvo_db_instance: DatabaseDriver | undefined;
  var __voicenuvo_db_ready: Promise<void> | undefined;
}

function getDatabaseDir(): string {
  const customPath = process.env.SQLITE_DB_PATH || process.env.PGLITE_DATA_DIR;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), 'data', 'voicenuvo_pg');
}

/**
 * Creates PGlite driver persisted to local disk
 */
function createPGliteDriver(dbDir: string): DatabaseDriver {
  fs.mkdirSync(dbDir, { recursive: true });
  const pglite = new PGlite(dbDir);

  const driver: DatabaseDriver = {
    type: 'pglite',
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      const res = await pglite.query(sql, params);
      return res.rows as T[];
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
      const rows = await driver.query<T>(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    async exec(sql: string): Promise<void> {
      await pglite.exec(sql);
    },
    async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      return (await pglite.transaction(async (tx) => {
        const txClient: TransactionClient = {
          isTransaction: true,
          async query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]> {
            const res = await tx.query(sql, params);
            return res.rows as R[];
          },
          async queryOne<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R | null> {
            const res = await tx.query(sql, params);
            const rows = res.rows as R[];
            return rows.length > 0 ? rows[0] : null;
          },
          async exec(sql: string): Promise<void> {
            await tx.exec(sql);
          },
        };
        return await fn(txClient);
      })) as T;
    },
    async withUserContext<T>(userId: string, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      return driver.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
        return fn(tx);
      });
    },
    async close() {
      await pglite.close();
    },
  };

  return driver;
}

/**
 * Creates pg.Pool driver connecting to remote PostgreSQL / Supabase
 */
export function createPgPoolDriver(connectionString: string): DatabaseDriver {
  const isProd = process.env.NODE_ENV === 'production';
  const isSupabase = connectionString.includes('supabase.co');
  const ssl = connectionString.includes('sslmode=disable')
    ? false
    : isProd || isSupabase || connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined;

  const pool = new Pool({
    connectionString,
    ssl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const driver: DatabaseDriver = {
    type: 'postgres',
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
      const rows = await driver.query<T>(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const txClient: TransactionClient = {
          isTransaction: true,
          async query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]> {
            const res = await client.query(sql, params);
            return res.rows as R[];
          },
          async queryOne<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R | null> {
            const res = await client.query(sql, params);
            const rows = res.rows as R[];
            return rows.length > 0 ? rows[0] : null;
          },
          async exec(sql: string): Promise<void> {
            await client.query(sql);
          },
        };
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async withUserContext<T>(userId: string, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      return driver.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
        return fn(tx);
      });
    },
    async close() {
      await pool.end();
    },
  };

  return driver;
}

/**
 * Initialize or reuse singleton database driver
 */
export function getDatabaseDriver(): DatabaseDriver {
  if (globalThis.__voicenuvo_db_instance) {
    return globalThis.__voicenuvo_db_instance;
  }

  // Enforce startup validation: production MUST have valid DATABASE_URL
  const config = validateEnvironment();
  const databaseUrl = config.databaseUrl;

  let driver: DatabaseDriver;
  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    logger.info('db.connect_pool', { action: 'DB_CONNECT', metadata: { driver: 'postgres' } });
    driver = createPgPoolDriver(databaseUrl);
  } else {
    // In production, validateEnvironment would have already failed fast above
    const dataDir = getDatabaseDir();
    logger.info('db.connect_pglite', { action: 'DB_CONNECT', metadata: { driver: 'pglite', dataDir } });
    driver = createPGliteDriver(dataDir);
  }

  globalThis.__voicenuvo_db_instance = driver;
  return driver;
}

/**
 * Migration Runner: Runs deterministic migration SQL scripts in order
 */
export async function runMigrations(driver: DatabaseDriver): Promise<void> {
  // Ensure migration tracking table exists
  await driver.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await driver.query<{ name: string }>(
    'SELECT name FROM _migrations ORDER BY name ASC;'
  );
  const applied = new Set(appliedRows.map((r) => r.name));

  const migrationsDir = path.resolve(process.cwd(), 'src', 'lib', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    // Check if this is a seed migration
    const isSeed = file.includes('seed');
    if (isSeed) {
      // Production safety rules (Section 7):
      // 1. If SEED_DEMO_DATA is explicitly 'false', NEVER seed in any environment
      if (process.env.SEED_DEMO_DATA === 'false') {
        continue;
      }
      // 2. In production, demo users are NEVER inserted unless SEED_DEMO_DATA is explicitly 'true'
      const isProd = process.env.NODE_ENV === 'production';
      if (isProd && process.env.SEED_DEMO_DATA !== 'true') {
        continue;
      }
    }

    if (!applied.has(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Strip extensions that may require superuser in managed cloud databases or Wasm
      const sanitizedSql = sql
        .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";?/gi, '')
        .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";?/gi, '');

      logger.info('db.migration_start', { action: 'MIGRATION', metadata: { migration: file } });
      await driver.transaction(async (tx) => {
        if (tx.exec) {
          await tx.exec(sanitizedSql);
        } else {
          await tx.query(sanitizedSql);
        }
        await tx.query('INSERT INTO _migrations (name) VALUES ($1);', [file]);
      });
      logger.info('db.migration_success', { action: 'MIGRATION', metadata: { migration: file } });
    }
  }
}

let lastMigrationCheck = 0;
let isMigrating = false;

/**
 * Global Database Initializer
 */
export async function ensureDatabaseReady(): Promise<DatabaseDriver> {
  const driver = getDatabaseDriver();
  if (!globalThis.__voicenuvo_db_ready) {
    globalThis.__voicenuvo_db_ready = runMigrations(driver);
    await globalThis.__voicenuvo_db_ready;
    lastMigrationCheck = Date.now();
    return driver;
  }
  await globalThis.__voicenuvo_db_ready;

  // In non-production environments, check for newly added migration files periodically
  const now = Date.now();
  if (process.env.NODE_ENV !== 'production' && !isMigrating && now - lastMigrationCheck > 3000) {
    lastMigrationCheck = now;
    isMigrating = true;
    try {
      await runMigrations(driver);
    } catch (err) {
      logger.error('db.migration_check_error', { action: 'MIGRATION', error: (err as Error).message });
    } finally {
      isMigrating = false;
    }
  }

  return driver;
}
