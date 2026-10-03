import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations, TransactionClient } from '@/lib/db/client';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Seed Data Production Safety (Section 7)', () => {
  const originalEnv = { ...process.env };
  const tempDbDir = path.resolve(process.cwd(), 'data', 'temp_seed_safety_test');

  beforeEach(() => {
    fs.rmSync(tempDbDir, { recursive: true, force: true });
    fs.mkdirSync(tempDbDir, { recursive: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDbDir, { recursive: true, force: true });
  });

  it('guarantees that SEED_DEMO_DATA=false prevents demo users and demo organizations from being created', async () => {
    process.env.SEED_DEMO_DATA = 'false';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const pglite = new PGlite(tempDbDir);
    const driver = {
      type: 'pglite' as const,
      async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
        const res = await pglite.query(sql, params);
        return res.rows as T[];
      },
      async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
        const rows = await this.query<T>(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async exec(sql: string): Promise<void> {
        await pglite.exec(sql);
      },
      async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
        return (await pglite.transaction(async (tx) => {
          return await fn({
            isTransaction: true,
            query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]> => {
              const res = await tx.query(sql, params);
              return res.rows as R[];
            },
            queryOne: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R | null> => {
              const r = (await tx.query(sql, params)).rows;
              return r.length > 0 ? (r[0] as R) : null;
            },
            exec: async (sql: string): Promise<void> => {
              await tx.exec(sql);
            },
          });
        })) as T;
      },
      async close() {
        await pglite.close();
      },
    };

    // Run migrations with SEED_DEMO_DATA=false
    await runMigrations(driver);

    // Verify: Core schema tables exist
    const tables = await driver.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    );
    const tableNames = tables.map((t) => t.table_name);
    expect(tableNames).toContain('organizations');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('audit_logs');
    expect(tableNames).toContain('rate_limits');

    // CRITICAL: Verify NO demo users exist
    const users = await driver.query('SELECT * FROM users;');
    expect(users.length).toBe(0);

    // CRITICAL: Verify NO demo organizations exist
    const orgs = await driver.query('SELECT * FROM organizations;');
    expect(orgs.length).toBe(0);

    await driver.close();
  });

  it('allows demo seed data when SEED_DEMO_DATA=true', async () => {
    process.env.SEED_DEMO_DATA = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

    const pglite = new PGlite(tempDbDir);
    const driver = {
      type: 'pglite' as const,
      async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
        const res = await pglite.query(sql, params);
        return res.rows as T[];
      },
      async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
        const rows = await this.query<T>(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async exec(sql: string): Promise<void> {
        await pglite.exec(sql);
      },
      async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
        return (await pglite.transaction(async (tx) => {
          return await fn({
            isTransaction: true,
            query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]> => {
              const res = await tx.query(sql, params);
              return res.rows as R[];
            },
            queryOne: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R | null> => {
              const r = (await tx.query(sql, params)).rows;
              return r.length > 0 ? (r[0] as R) : null;
            },
            exec: async (sql: string): Promise<void> => {
              await tx.exec(sql);
            },
          });
        })) as T;
      },
      async close() {
        await pglite.close();
      },
    };

    await runMigrations(driver);

    // Verify seed data is populated
    const users = await driver.query<{ email: string }>('SELECT email FROM users;');
    expect(users.length).toBeGreaterThanOrEqual(3);
    const emails = users.map((u) => u.email);
    expect(emails).toContain('admin@voicenuvo.com');

    const orgs = await driver.query<{ slug: string }>('SELECT slug FROM organizations;');
    expect(orgs.length).toBeGreaterThanOrEqual(3);
    const slugs = orgs.map((o) => o.slug);
    expect(slugs).toContain('voicenuvo-platform');

    await driver.close();
  });
});
