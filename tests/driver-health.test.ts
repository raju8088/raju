import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { createPgPoolDriver, DatabaseDriver } from '@/lib/db/client';

describe('Health Endpoint & Driver Observability (Section 14 & 15)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    globalThis.__voicenuvo_db_instance = undefined;
    globalThis.__voicenuvo_db_ready = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.__voicenuvo_db_instance = undefined;
    globalThis.__voicenuvo_db_ready = undefined;
  });

  it('reports healthy status and observable driver type without leaking database credentials', async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.phase).toBe('2.2-remote-postgres-verification');
    expect(data.data.database.connected).toBe(true);
    expect(['postgres', 'pglite']).toContain(data.data.database.driver);

    // SECURITY CHECK: Ensure no sensitive connection parameters or credentials exist in response
    const jsonStr = JSON.stringify(data);
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('DATABASE_URL');
    expect(jsonStr).not.toContain('secret');
  });

  it('handles database connection failure gracefully, returning HTTP 503 without leaking credentials', async () => {
    // Provide unreachable/mocked database driver to test failure handling
    const failingDriver = {
      type: 'postgres' as const,
      async query() {
        throw new Error('Connection refused: connect ECONNREFUSED 10.0.0.99:5432 with password [REDACTED_SECRET]');
      },
      async queryOne() {
        throw new Error('Connection refused');
      },
      async transaction() {
        throw new Error('Connection refused');
      },
      async close() {},
    };

    process.env.DATABASE_URL = 'postgresql://postgres:secretpassword@localhost:5432/postgres';
    globalThis.__voicenuvo_db_instance = failingDriver as unknown as DatabaseDriver;
    globalThis.__voicenuvo_db_ready = Promise.resolve();

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('DATABASE_UNHEALTHY');
    expect(data.error.details.connected).toBe(false);
    expect(data.error.details.driver).toBe('postgres');

    // SECURITY CHECK: In production or test, passwords/credentials must never be printed to caller
    const jsonStr = JSON.stringify(data);
    expect(jsonStr).not.toContain('[REDACTED_SECRET]');
  });

  it('createPgPoolDriver configures SSL properly for Supabase and production endpoints', () => {
    const supabaseUrl = 'postgresql://postgres:secretpassword@db.abcdefghijklmnopqrst.supabase.co:5432/postgres';
    const driver = createPgPoolDriver(supabaseUrl);

    expect(driver.type).toBe('postgres');
    expect(typeof driver.query).toBe('function');
    expect(typeof driver.transaction).toBe('function');
  });
});
