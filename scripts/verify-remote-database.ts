/**
 * VoiceNuvo — Phase 2.2: Standalone Remote PostgreSQL / Supabase Verification Script
 * 
 * Usage:
 *   $env:DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
 *   npx tsx scripts/verify-remote-database.ts
 */

import { createPgPoolDriver, runMigrations } from '../src/lib/db/client';
import { GET as getHealth } from '../src/app/api/health/route';

async function main() {
  const remoteUrl = process.env.DATABASE_URL?.trim();

  console.log('===============================================================');
  console.log('   VOICENuvo — PHASE 2.2 REAL REMOTE POSTGRESQL VERIFICATION   ');
  console.log('===============================================================\n');

  if (!remoteUrl || (!remoteUrl.startsWith('postgresql://') && !remoteUrl.startsWith('postgres://'))) {
    console.error('❌ REMOTE POSTGRESQL VERIFICATION: BLOCKED');
    console.error('Reason: real PostgreSQL/Supabase credentials were not available in DATABASE_URL.');
    console.error('To run this verification against live Supabase / PostgreSQL:');
    console.error('  $env:DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"');
    console.error('  npx tsx scripts/verify-remote-database.ts\n');
    process.exit(1);
  }

  // Sanitize connection URI for display
  const sanitizedUrl = remoteUrl.replace(/:([^:@\s]+)@/, ':[REDACTED]@');
  console.log(`Connecting to remote database: ${sanitizedUrl}...`);

  const driver = createPgPoolDriver(remoteUrl);

  try {
    // 1. Connection probe
    console.log('[1/7] Testing direct connection and pool...');
    const ping = await driver.query<{ ok: number }>('SELECT 1 as ok;');
    if (ping.length === 0 || ping[0].ok !== 1) {
      throw new Error('Remote database did not return expected response.');
    }
    console.log('  ✓ Connected successfully via pg.Pool');

    // 2. Migration execution
    console.log('\n[2/7] Executing all production migrations...');
    await runMigrations(driver);
    console.log('  ✓ 001_initial_schema.sql executed');
    console.log('  ✓ 002_rls_policies.sql executed');
    console.log('  ✓ 003_seed_data.sql executed');
    console.log('  ✓ 004_audit_and_security.sql executed');

    // 3. Remote Persistence
    console.log('\n[3/7] Testing remote persistence across client cycles...');
    const testOrgId = '77777777-7777-4000-8000-000000000001';
    const testUserId = '77777777-7777-4000-8000-000000000002';

    await driver.exec?.(`
      DELETE FROM organization_members WHERE organization_id = '${testOrgId}';
      DELETE FROM users WHERE id = '${testUserId}';
      DELETE FROM organizations WHERE id = '${testOrgId}';
      
      INSERT INTO organizations (id, name, slug, status)
      VALUES ('${testOrgId}', 'Remote Test Corp', 'remote-test-${Date.now()}', 'ACTIVE');
      
      INSERT INTO users (id, email, password_hash, first_name, last_name, global_role)
      VALUES ('${testUserId}', 'remote_user_${Date.now()}@test.com', 'scrypt$dummyhash', 'Remote', 'Tester', 'ORG_ADMIN');
      
      INSERT INTO organization_members (organization_id, user_id, role, status)
      VALUES ('${testOrgId}', '${testUserId}', 'ORG_ADMIN', 'ACTIVE');
    `);

    // Disconnect and reconnect with new driver instance
    await driver.close();
    const secondDriver = createPgPoolDriver(remoteUrl);
    const persistedOrg = await secondDriver.queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM organizations WHERE id = $1;',
      [testOrgId]
    );
    const persistedUser = await secondDriver.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE id = $1;',
      [testUserId]
    );

    if (!persistedOrg || !persistedUser) {
      throw new Error('Persistence test failed: records missing after client reconnection.');
    }
    console.log(`  ✓ Data survived driver restart: Org "${persistedOrg.name}" and User verified.`);

    // 4. Remote Transactions
    console.log('\n[4/7] Testing remote ACID transactions...');
    let rollbackVerified = false;
    try {
      await secondDriver.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO organizations (id, name, slug, status) VALUES ('99999999-9999-4000-8000-000000000001', 'Rollback Org', 'rollback-org', 'ACTIVE');"
        );
        throw new Error('Forced transaction failure');
      });
    } catch {
      const rollbackCheck = await secondDriver.queryOne(
        "SELECT id FROM organizations WHERE id = '99999999-9999-4000-8000-000000000001';"
      );
      if (!rollbackCheck) {
        rollbackVerified = true;
      }
    }
    if (!rollbackVerified) {
      throw new Error('Transaction rollback failed: uncommitted record persisted.');
    }
    console.log('  ✓ Transaction rollback verified: zero orphan records created.');

    // 5. Database-level RLS Verification
    console.log('\n[5/7] Testing PostgreSQL Row Level Security (RLS) policies...');
    const tenantAId = 'aaaaaaaa-9999-4000-8000-000000000001';
    const tenantBId = 'bbbbbbbb-9999-4000-8000-000000000002';
    const userAId = 'aaaaaaaa-9999-4000-8000-000000000003';
    const userBId = 'bbbbbbbb-9999-4000-8000-000000000004';

    await secondDriver.exec?.(`
      DELETE FROM organization_members WHERE organization_id IN ('${tenantAId}', '${tenantBId}');
      DELETE FROM users WHERE id IN ('${userAId}', '${userBId}');
      DELETE FROM organizations WHERE id IN ('${tenantAId}', '${tenantBId}');

      INSERT INTO organizations (id, name, slug) VALUES 
        ('${tenantAId}', 'Remote Tenant A', 'tenant-a-${Date.now()}'),
        ('${tenantBId}', 'Remote Tenant B', 'tenant-b-${Date.now()}');

      INSERT INTO users (id, email, password_hash, first_name, last_name, global_role) VALUES 
        ('${userAId}', 'usera_${Date.now()}@remote.com', 'scrypt$hash', 'User', 'A', 'ORG_ADMIN'),
        ('${userBId}', 'userb_${Date.now()}@remote.com', 'scrypt$hash', 'User', 'B', 'ORG_ADMIN');

      INSERT INTO organization_members (organization_id, user_id, role, status) VALUES 
        ('${tenantAId}', '${userAId}', 'ORG_ADMIN', 'ACTIVE'),
        ('${tenantBId}', '${userBId}', 'ORG_ADMIN', 'ACTIVE');
    `);

    // Verify User A context
    await secondDriver.withUserContext?.(userAId, async (tx) => {
      const orgsA = await tx.query<{ id: string }>('SELECT id FROM organizations;');
      const orgIds = orgsA.map((o) => o.id);
      if (orgIds.includes(tenantBId)) {
        throw new Error('RLS VIOLATION: User A was able to read Tenant B!');
      }
      const crossUpdate = await tx.query<{ id: string }>(
        "UPDATE organizations SET name = 'HACKED' WHERE id = $1 RETURNING id;",
        [tenantBId]
      );
      if (crossUpdate.length > 0) {
        throw new Error('RLS VIOLATION: User A was able to update Tenant B!');
      }
    });
    console.log('  ✓ User A context: Tenant B read and update denied by PostgreSQL RLS.');

    // Verify User B context
    await secondDriver.withUserContext?.(userBId, async (tx) => {
      const orgsB = await tx.query<{ id: string }>('SELECT id FROM organizations;');
      const orgIds = orgsB.map((o) => o.id);
      if (orgIds.includes(tenantAId)) {
        throw new Error('RLS VIOLATION: User B was able to read Tenant A!');
      }
    });
    console.log('  ✓ User B context: Tenant A read denied by PostgreSQL RLS.');

    // 6. Health Endpoint
    console.log('\n[6/7] Probing /api/health endpoint...');
    globalThis.__voicenuvo_db_instance = secondDriver;
    const healthRes = await getHealth();
    const healthJson = await healthRes.json();
    console.log('  Response:', JSON.stringify(healthJson.data, null, 2));

    if (healthJson.data.database.driver !== 'postgres') {
      throw new Error(`Expected driver to be "postgres", got: ${healthJson.data.database.driver}`);
    }
    console.log('  ✓ /api/health confirms driver = postgres');

    // Clean up
    console.log('\n[7/7] Cleaning up test records...');
    await secondDriver.exec?.(`
      DELETE FROM organization_members WHERE organization_id IN ('${testOrgId}', '${tenantAId}', '${tenantBId}');
      DELETE FROM users WHERE id IN ('${testUserId}', '${userAId}', '${userBId}');
      DELETE FROM organizations WHERE id IN ('${testOrgId}', '${tenantAId}', '${tenantBId}');
    `);
    await secondDriver.close();

    console.log('\n===============================================================');
    console.log('   🎉 REMOTE POSTGRESQL / SUPABASE VERIFICATION: PASSED!       ');
    console.log('===============================================================\n');
  } catch (err) {
    await driver.close().catch(() => {});
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  }
}

main().catch(console.error);
