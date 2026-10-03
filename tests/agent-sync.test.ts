import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVoiceProvider } from '@/lib/providers/voice/mock.provider';
import {
  providerConnectionService,
  setGlobalMockVoiceProvider,
} from '@/services/provider-connection.service';
import { agentService } from '@/services/agent.service';
import { providerConnectionRepository } from '@/lib/db/repositories/provider-connection.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { ensureDatabaseReady } from '@/lib/db/client';
import type { NormalizedAgent } from '@/lib/providers/voice/provider-types';

describe('VoiceNuvo — OmniDimension Agent Sync & Pagination Verification (Sections 20-28)', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminId = 'd0000000-0000-0000-0000-000000000002';
  let mockProvider: MockVoiceProvider;

  beforeEach(async () => {
    await ensureDatabaseReady();
    mockProvider = new MockVoiceProvider();
    setGlobalMockVoiceProvider(mockProvider);

    // Clean up test org agents and connections before each test
    const db = await ensureDatabaseReady();
    await db.query(`DELETE FROM voice_agents WHERE organization_id IN ($1, $2);`, [orgAId, orgBId]);
    await providerConnectionRepository.delete(orgAId);
    await providerConnectionRepository.delete(orgBId);
  });

  afterEach(async () => {
    setGlobalMockVoiceProvider(null);
    try {
      const db = await ensureDatabaseReady();
      await db.query(`DELETE FROM voice_agents WHERE organization_id IN ($1, $2);`, [orgAId, orgBId]);
      await providerConnectionRepository.delete(orgAId);
      await providerConnectionRepository.delete(orgBId);
    } catch {
      // Ignore cleanup error
    }
  });

  // ==========================================
  // Section 20: Test: One Page
  // ==========================================
  it('Section 20: returns 5 agents when provider returns 5 agents on a single page', async () => {
    const agents5: NormalizedAgent[] = Array.from({ length: 5 }, (_, i) => ({
      id: `bot_single_${i + 1}`,
      name: `Single Page Agent ${i + 1}`,
      status: 'ACTIVE',
      model: 'gpt-4o-mini',
      voiceName: 'Rachel',
    }));

    mockProvider.setMockAgents(agents5);

    // Connect organization
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_single_page');

    const result = await agentService.listAgents(orgAId);
    expect(result.length).toBe(5);
    expect(result.map((a) => a.name).sort()).toEqual(agents5.map((a) => a.name).sort());
  });

  // ==========================================
  // Section 21: Test: Multiple Pages (150 + 150 + 41 = 341 agents)
  // ==========================================
  it('Section 21: successfully paginates and syncs 341 agents across 3 pages without duplicates', async () => {
    const agents341: NormalizedAgent[] = Array.from({ length: 341 }, (_, i) => ({
      id: `bot_multi_${i + 1}`,
      name: `Paginated Agent ${i + 1}`,
      status: 'ACTIVE',
      model: 'gpt-4o-mini',
      voiceName: 'Rachel',
    }));

    mockProvider.setMockAgents(agents341);

    // Connect API key
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_multi_page');

    // Verify all 341 agents are retrieved
    const agents = await agentService.listAgents(orgAId);
    expect(agents.length).toBe(341);

    // Verify no duplicates
    const uniqueIds = new Set(agents.map((a) => a.provider_agent_id || a.id));
    expect(uniqueIds.size).toBe(341);

    // Check database records count
    const localMappings = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(localMappings.length).toBe(341);
  });

  // ==========================================
  // Section 22: Test: Existing Local Mappings
  // ==========================================
  it('Section 22: updates local count from 3 local mappings to 10 when provider has 10 agents', async () => {
    // 1. Pre-seed 3 local mappings
    for (let i = 1; i <= 3; i++) {
      await voiceAgentRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerAgentId: `pre_existing_bot_${i}`,
        name: `Pre-existing Bot ${i}`,
        status: 'ACTIVE',
      });
    }

    const initial = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(initial.length).toBe(3);

    // 2. Set provider with 10 agents (including the 3 existing ones)
    const provider10: NormalizedAgent[] = Array.from({ length: 10 }, (_, i) => ({
      id: i < 3 ? `pre_existing_bot_${i + 1}` : `new_provider_bot_${i + 1}`,
      name: i < 3 ? `Pre-existing Bot ${i + 1} Updated` : `New Bot ${i + 1}`,
      status: 'ACTIVE',
      model: 'gpt-4o-mini',
    }));
    mockProvider.setMockAgents(provider10);

    // Connect and sync
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_existing');

    const synced = await agentService.listAgents(orgAId);
    expect(synced.length).toBe(10);

    const mappings = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(mappings.length).toBe(10);
  });

  // ==========================================
  // Section 23: Test: Existing Provider Agents
  // ==========================================
  it('Section 23: external agents created directly in OmniDimension appear in VoiceNuvo without local creation first', async () => {
    // External agents created outside of VoiceNuvo
    const externalAgents: NormalizedAgent[] = [
      { id: 'ext_bot_1', name: 'Direct Omni Agent 1', status: 'ACTIVE', model: 'gpt-4o' },
      { id: 'ext_bot_2', name: 'Direct Omni Agent 2', status: 'ACTIVE', model: 'claude-3-5-sonnet' },
      { id: 'ext_bot_3', name: 'Direct Omni Agent 3', status: 'ACTIVE', model: 'gemini-1.5-flash' },
    ];
    mockProvider.setMockAgents(externalAgents);

    // Connect organization
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_external');

    // List agents in VoiceNuvo
    const list = await agentService.listAgents(orgAId);
    expect(list.length).toBe(3);
    expect(list.find((a) => a.name === 'Direct Omni Agent 1')).toBeDefined();
    expect(list.find((a) => a.name === 'Direct Omni Agent 2')).toBeDefined();
    expect(list.find((a) => a.name === 'Direct Omni Agent 3')).toBeDefined();
  });

  // ==========================================
  // Section 24: Test: Duplicate Sync (Idempotency)
  // ==========================================
  it('Section 24: running sync twice retains exactly 61 mappings without duplication', async () => {
    const agents61: NormalizedAgent[] = Array.from({ length: 61 }, (_, i) => ({
      id: `bot_61_${i + 1}`,
      name: `Agent ${i + 1}`,
      status: 'ACTIVE',
      model: 'gpt-4o-mini',
    }));
    mockProvider.setMockAgents(agents61);

    // Connect (first sync)
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_idempotency');
    const firstList = await agentService.listAgents(orgAId);
    expect(firstList.length).toBe(61);

    let localMappings = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(localMappings.length).toBe(61);

    // Second sync (explicit forceRefresh)
    const secondSync = await agentService.syncOrganizationAgents(orgAId, userAdminId);
    expect(secondSync.providerAgentsCount).toBe(61);
    expect(secondSync.updatedCount).toBe(61);
    expect(secondSync.createdCount).toBe(0);

    localMappings = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(localMappings.length).toBe(61); // NOT 122!
  });

  // ==========================================
  // Section 25: Test: Provider Removal
  // ==========================================
  it('Section 25: when provider removes an agent, it is marked INACTIVE and historical record is preserved', async () => {
    // 1. Initial 10 agents
    const initial10: NormalizedAgent[] = Array.from({ length: 10 }, (_, i) => ({
      id: `bot_remove_${i + 1}`,
      name: `Agent ${i + 1}`,
      status: 'ACTIVE',
    }));
    mockProvider.setMockAgents(initial10);

    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_mock_key_removal');
    const list1 = await agentService.listAgents(orgAId);
    expect(list1.length).toBe(10);

    // 2. Provider now removes 1 agent (only 9 remaining)
    const remaining9 = initial10.slice(0, 9);
    mockProvider.setMockAgents(remaining9);

    // Sync again
    await agentService.syncOrganizationAgents(orgAId, userAdminId);

    // Active list should show 9
    const activeList = await agentService.listAgents(orgAId);
    expect(activeList.length).toBe(9);

    // Database must still preserve all 10 records for historical integrity!
    const allDbRecords = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(allDbRecords.length).toBe(10);

    // The 10th record must be marked INACTIVE
    const removedRecord = allDbRecords.find((r) => r.provider_agent_id === 'bot_remove_10');
    expect(removedRecord).toBeDefined();
    expect(removedRecord!.is_active).toBe(false);
    expect(removedRecord!.status).toBe('INACTIVE');
  });

  // ==========================================
  // Section 26: Test: Tenant Isolation
  // ==========================================
  it('Section 26: Tenant A cannot see Tenant B agents, and Tenant B cannot see Tenant A agents', async () => {
    // Tenant A agents
    const agentsA: NormalizedAgent[] = [
      { id: 'bot_tenant_a_1', name: 'Tenant A Agent 1', status: 'ACTIVE' },
      { id: 'bot_tenant_a_2', name: 'Tenant A Agent 2', status: 'ACTIVE' },
    ];
    mockProvider.setMockAgents(agentsA);
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_tenant_a_key');

    // Tenant B agents
    const agentsB: NormalizedAgent[] = [
      { id: 'bot_tenant_b_1', name: 'Tenant B Agent 1', status: 'ACTIVE' },
      { id: 'bot_tenant_b_2', name: 'Tenant B Agent 2', status: 'ACTIVE' },
      { id: 'bot_tenant_b_3', name: 'Tenant B Agent 3', status: 'ACTIVE' },
    ];
    mockProvider.setMockAgents(agentsB);
    await providerConnectionService.saveConnection(orgBId, userAdminId, 'sk_live_tenant_b_key');

    // Verify Tenant A sees only Tenant A agents
    const listA = await agentService.listAgents(orgAId);
    expect(listA.length).toBe(2);
    expect(listA.every((a) => a.name.includes('Tenant A'))).toBe(true);

    // Verify Tenant B sees only Tenant B agents
    const listB = await agentService.listAgents(orgBId);
    expect(listB.length).toBe(3);
    expect(listB.every((a) => a.name.includes('Tenant B'))).toBe(true);

    // Ensure Tenant A cannot resolve Tenant B agent by ID
    const agentBLocalId = listB[0].id;
    await expect(agentService.getAgent(orgAId, agentBLocalId)).rejects.toThrow();
  });

  // ==========================================
  // Section 27: Test: Provider Failure Fallback
  // ==========================================
  it('Section 27: provider failure does NOT wipe local agents; falls back safely to last-synced agents', async () => {
    // 1. Initial successful sync of 4 agents
    const agents4: NormalizedAgent[] = Array.from({ length: 4 }, (_, i) => ({
      id: `bot_fail_test_${i + 1}`,
      name: `Failover Agent ${i + 1}`,
      status: 'ACTIVE',
    }));
    mockProvider.setMockAgents(agents4);
    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_key_failover');

    const initialList = await agentService.listAgents(orgAId);
    expect(initialList.length).toBe(4);

    // 2. Simulate provider failure (e.g. 500 / 503 / network drop)
    mockProvider.shouldFailConnection = true;
    mockProvider.failureErrorMessage = 'OmniDimension 500 Internal Server Error';

    // 3. Request list with forceRefresh: should gracefully fall back to local mappings without throwing or wiping
    const fallbackList = await agentService.listAgents(orgAId, { forceRefresh: true });
    expect(fallbackList.length).toBe(4);
    expect(fallbackList.map((a) => a.name).sort()).toEqual(agents4.map((a) => a.name).sort());

    // Verify database records are intact
    const dbRecords = await voiceAgentRepository.findByOrganizationId(orgAId);
    expect(dbRecords.length).toBe(4);
  });

  // ==========================================
  // Section 28: Test: Empty Account
  // ==========================================
  it('Section 28: returns 0 agents when provider account is empty without failing', async () => {
    mockProvider.clearMockAgents();

    await providerConnectionService.saveConnection(orgAId, userAdminId, 'sk_live_empty_account_key');

    const list = await agentService.listAgents(orgAId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });
});
