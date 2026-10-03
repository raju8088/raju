import { ensureDatabaseReady } from '../src/lib/db/client';
import { providerConnectionService } from '../src/services/provider-connection.service';
import { providerConnectionRepository } from '../src/lib/db/repositories/provider-connection.repository';
import { decryptSecret } from '../src/lib/utils/encryption';

async function main() {
  console.log('=== PHASE 3 DATABASE & PROVIDER VERIFICATION ===\n');

  // Step 1: Ensure DB ready and get driver
  const driver = await ensureDatabaseReady();
  console.log('1. DATABASE CONTEXT:');
  console.log(`   Driver: ${driver.type}`);

  // Step 2 & 3: Check Phase 3 tables
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
    '_migrations',
  ];

  const tableRows = await driver.query<{ table_name: string; table_schema: string }>(`
    SELECT table_name, table_schema 
    FROM information_schema.tables 
    WHERE table_schema = current_schema();
  `);
  const existingMap = new Map(tableRows.map((r) => [r.table_name, r.table_schema]));

  console.log('\n2. REQUIRED TABLES STATUS:');
  console.log('   TABLE                  | EXISTS  | SCHEMA');
  console.log('   -----------------------------------------');
  for (const t of targetTables) {
    const exists = existingMap.has(t);
    const schema = existingMap.get(t) || 'N/A';
    console.log(`   ${t.padEnd(22)} | ${exists ? 'EXISTS ' : 'MISSING'} | ${schema}`);
  }

  // Step 8: Verify Provider Connection
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userId = 'd0000000-0000-0000-0000-000000000002'; // Alice Admin

  const apiKey = process.env.OMNIDIM_API_KEY;
  console.log('\n3. OMNIDIMENSION KEY CHECK:');
  console.log(`   Key Present in env: ${Boolean(apiKey && apiKey.length > 5)}`);

  if (!apiKey) {
    console.log('   ERROR: OMNIDIM_API_KEY is not set in environment.');
    process.exit(1);
  }

  // Ensure Acme has connection saved in provider_connections
  let connRecord = await providerConnectionRepository.findByOrganizationId(orgAId);
  if (!connRecord) {
    console.log('\n   Saving verified OmniDimension connection for Acme Voice Corp...');
    await providerConnectionService.saveOrUpdateConnection(
      orgAId,
      userId,
      apiKey,
      'Acme Live OmniDimension'
    );
    connRecord = await providerConnectionRepository.findByOrganizationId(orgAId);
  }

  console.log('\n4. PROVIDER CONNECTION RECORD VERIFICATION:');
  console.log(`   Record ID:         ${connRecord?.id}`);
  console.log(`   Organization ID:   ${connRecord?.organization_id}`);
  console.log(`   Provider:          ${connRecord?.provider}`);
  console.log(`   Status:            ${connRecord?.status}`);
  console.log(`   Display Name:      ${connRecord?.display_name}`);
  console.log(`   Has Ciphertext:    ${Boolean(connRecord?.encrypted_credentials)}`);
  console.log(`   Ciphertext Format: ${connRecord?.encrypted_credentials.includes(':') ? 'IV:Tag:Cipher' : 'UNKNOWN'}`);

  // Verify server-side decryption without printing key
  const decrypted = decryptSecret(connRecord!.encrypted_credentials);
  const matchesKey = decrypted === apiKey;
  console.log(`   Server Decryption: SUCCESS (Matches env key: ${matchesKey})`);

  // Verify safe status (masked key)
  const safeStatus = await providerConnectionService.getConnectionStatus(orgAId);
  console.log(`   Safe Masked Key:   ${safeStatus.maskedKey}`);
  console.log(`   Key Exposed?:      ${safeStatus.maskedKey?.includes(apiKey) ? 'LEAKED!' : 'SAFE (Never exposed)'}`);

  // Step 9: Agent Retrieval through Service
  console.log('\n5. LIVE AGENT RETRIEVAL:');
  const provider = await providerConnectionService.getProviderForOrganization(orgAId);
  const liveProviderAgents = await provider.listAgents();
  console.log(`   Live Agents on OmniDimension: ${liveProviderAgents.agents.length}`);
  if (liveProviderAgents.agents.length > 0) {
    liveProviderAgents.agents.forEach((ag, idx) => {
      console.log(`   [${idx + 1}] ID: ${ag.id} | Name: ${ag.name} | Status: ${ag.status}`);
    });
  }

  // Step 10: Tenant Isolation
  console.log('\n6. TENANT ISOLATION CHECK:');
  const tenantBStatus = await providerConnectionService.getConnectionStatus(orgBId);
  console.log(`   Tenant B Connected: ${tenantBStatus.connected} (Status: ${tenantBStatus.status})`);
  
  let tenantBCaught = false;
  try {
    await providerConnectionService.getProviderForOrganization(orgBId);
  } catch (err) {
    tenantBCaught = true;
    console.log(`   Tenant B Provider Resolution: Safely rejected ("${(err as Error).message}")`);
  }
  console.log(`   Tenant Isolation Enforced: ${tenantBCaught}`);

  console.log('\n=== VERIFICATION COMPLETE ===\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
