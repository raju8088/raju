import { getDatabaseDriver, ensureDatabaseReady } from '../src/lib/db/client';
import { validateEnvironment } from '../src/lib/config/env';

async function main() {
  console.log('=== DATABASE DIAGNOSTIC START ===\n');

  // 1. Environment & Config
  const envConfig = validateEnvironment();
  const rawDbUrl = process.env.DATABASE_URL?.trim();
  const maskedDbUrl = rawDbUrl
    ? rawDbUrl.replace(/:([^:@\s]+)@/, ':[REDACTED]@')
    : 'UNSET (using PGlite embedded)';

  console.log('1. ENVIRONMENT CONFIGURATION:');
  console.log(`   NODE_ENV:      ${envConfig.nodeEnv}`);
  console.log(`   DB DRIVER:     ${getDatabaseDriver()}`);
  console.log(`   DATABASE_URL:  ${maskedDbUrl}`);
  console.log(`   dataDir:       ${process.env.PGLITE_DATA_DIR || './data/voicenuvo_pg'}`);

  // 2. Active Driver Identification
  const driver = await ensureDatabaseReady();
  console.log('\n2. ACTIVE DRIVER:');
  console.log(`   Driver Type:   ${driver.type}`);

  // 3. Database Metadata
  try {
    const meta = await driver.query<{
      current_database: string;
      current_schema: string;
      search_path: string;
    }>(`
      SELECT 
        current_database() as current_database,
        current_schema() as current_schema,
        current_setting('search_path') as search_path;
    `);
    console.log('\n3. DATABASE CONTEXT:');
    console.log(`   Database Name: ${meta[0]?.current_database}`);
    console.log(`   Schema:        ${meta[0]?.current_schema}`);
    console.log(`   Search Path:   ${meta[0]?.search_path}`);
  } catch (err) {
    console.log('   Error querying database context:', (err as Error).message);
  }

  // 4. Check Applied Migrations in _migrations table
  console.log('\n4. APPLIED MIGRATIONS IN DB:');
  try {
    const appliedRows = await driver.query<{ name: string; applied_at: string }>(
      'SELECT name, applied_at FROM _migrations ORDER BY name ASC;'
    );
    if (appliedRows.length === 0) {
      console.log('   (No migrations recorded in _migrations table!)');
    } else {
      appliedRows.forEach((r) => {
        console.log(`   - ${r.name} (applied: ${r.applied_at})`);
      });
    }
  } catch (err) {
    console.log('   _migrations table check failed:', (err as Error).message);
  }

  // 5. Check All Core Tables in information_schema.tables
  console.log('\n5. TABLE EXISTENCE IN DATABASE (information_schema.tables):');
  const targetTables = [
    'organizations',
    'users',
    'organization_members',
    'audit_logs',
    'rate_limits',
    'provider_connections',
    'voice_agents',
    'knowledge_files',
    'phone_numbers',
    'calls',
    'campaigns',
    'campaign_contacts',
    'campaign_number_pool',
    '_migrations',
  ];

  try {
    const tableRows = await driver.query<{ table_name: string; table_schema: string }>(`
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = current_schema();
    `);
    const existingTableNames = new Map(tableRows.map((r) => [r.table_name, r.table_schema]));

    console.log('   TABLE | EXISTS | SCHEMA');
    console.log('   ----------------------------------------');
    for (const t of targetTables) {
      const exists = existingTableNames.has(t);
      const schema = existingTableNames.get(t) || 'N/A';
      console.log(`   ${t.padEnd(22)} | ${exists ? 'EXISTS ' : 'MISSING'} | ${schema}`);
    }
  } catch (err) {
    console.log('   Error querying information_schema:', (err as Error).message);
  }

  console.log('\n=== DATABASE DIAGNOSTIC END ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
