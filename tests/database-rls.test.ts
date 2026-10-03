import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabaseForTests } from '@/lib/db';
import { ensureDatabaseReady } from '@/lib/db/client';

describe('Mandatory PostgreSQL Engine-Level Row Level Security (RLS) Verification', () => {
  const orgAId = 'aaaaaaaa-1111-4000-8000-000000000001';
  const orgBId = 'bbbbbbbb-2222-4000-8000-000000000002';
  const userAId = 'aaaaaaaa-1111-4000-8000-000000000003';
  const userBId = 'bbbbbbbb-2222-4000-8000-000000000004';
  const mainAdminId = 'd0000000-0000-0000-0000-000000000001'; // From seed migrations

  beforeEach(async () => {
    await resetDatabaseForTests();
    const driver = await ensureDatabaseReady();

    // 1. Ensure dedicated non-superuser role exists for simulating tenant connection (Supabase 'authenticated' role pattern)
    await driver.exec?.(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_client_role') THEN
          CREATE ROLE tenant_client_role NOSUPERUSER NOINHERIT;
        END IF;
      END
      $$;
      GRANT USAGE ON SCHEMA public TO tenant_client_role;
      GRANT USAGE ON SCHEMA auth TO tenant_client_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO tenant_client_role;
    `);

    // 2. Insert test organizations and members in privileged admin setup
    await driver.query(
      `INSERT INTO organizations (id, name, slug, brand_name, status) VALUES
       ($1, 'Tenant Alpha Corp', 'rls-alpha', 'Alpha Voice', 'ACTIVE'),
       ($2, 'Tenant Beta Logistics', 'rls-beta', 'Beta Voice', 'ACTIVE');`,
      [orgAId, orgBId]
    );

    await driver.query(
      `INSERT INTO users (id, email, name, status) VALUES
       ($1, 'userA@alpha.com', 'User Alpha', 'ACTIVE'),
       ($2, 'userB@beta.com', 'User Beta', 'ACTIVE');`,
      [userAId, userBId]
    );

    await driver.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
       ($1, $2, 'ORG_ADMIN', 'ACTIVE'),
       ($3, $4, 'ORG_ADMIN', 'ACTIVE');`,
      [orgAId, userAId, orgBId, userBId]
    );
  });

  it('RLS enforces that User A can ONLY select Organization A and cannot see Organization B', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      // Act as non-superuser tenant client
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userAId]);

      // Direct SQL SELECT bypassing application layer
      const rows = await tx.query<{ id: string; name: string }>('SELECT id, name FROM organizations ORDER BY name ASC;');
      const orgIds = rows.map((r) => r.id);

      // Must see Org A
      expect(orgIds).toContain(orgAId);
      // Must NOT see Org B
      expect(orgIds).not.toContain(orgBId);
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Tenant Alpha Corp');
    });
  });

  it('RLS enforces that User B can ONLY select Organization B and cannot see Organization A (Reverse)', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userBId]);

      const rows = await tx.query<{ id: string; name: string }>('SELECT id, name FROM organizations ORDER BY name ASC;');
      const orgIds = rows.map((r) => r.id);

      expect(orgIds).toContain(orgBId);
      expect(orgIds).not.toContain(orgAId);
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Tenant Beta Logistics');
    });
  });

  it('RLS rejects unauthenticated database queries (returns 0 organizations when auth.uid is null)', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      // No set_config for request.jwt.claim.sub -> auth.uid() returns NULL
      const rows = await tx.query('SELECT * FROM organizations;');
      expect(rows.length).toBe(0);
    });
  });

  it('RLS blocks User A from updating Organization B at the database layer (0 rows updated)', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userAId]);

      // Attempt direct SQL update on Org B
      await tx.query(`UPDATE organizations SET name = 'Compromised Name' WHERE id = $1;`, [orgBId]);
    });

    // Check in privileged mode that Org B was NOT modified
    const orgB = await db.organizations.findById(orgBId);
    expect(orgB?.name).toBe('Tenant Beta Logistics');
  });

  it('RLS allows MAIN_ADMIN to view all tenant organizations across the platform', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [mainAdminId]);

      const rows = await tx.query<{ id: string }>('SELECT id FROM organizations;');
      const ids = rows.map((r) => r.id);

      expect(ids).toContain(orgAId);
      expect(ids).toContain(orgBId);
      // Main admin sees all organizations (including the 3 seeded ones)
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('RLS isolates member listings: User A can only see members in their own organization', async () => {
    const driver = await ensureDatabaseReady();

    await driver.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE tenant_client_role;');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userAId]);

      const members = await tx.query<{ user_id: string; organization_id: string }>(
        'SELECT user_id, organization_id FROM organization_members;'
      );

      // Must see User A in Org A
      const hasMemberA = members.some((m) => m.user_id === userAId && m.organization_id === orgAId);
      expect(hasMemberA).toBe(true);

      // Must NOT see User B in Org B
      const hasMemberB = members.some((m) => m.user_id === userBId || m.organization_id === orgBId);
      expect(hasMemberB).toBe(false);
    });
  });
});
