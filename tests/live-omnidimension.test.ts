import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OmniDimensionProvider } from '@/lib/providers/voice/omnidimension/omnidimension.provider';
import { getOmniDimensionClient } from '@/lib/providers/voice/omnidimension/omnidimension.client';
import {
  providerConnectionService,
  setGlobalMockVoiceProvider,
} from '@/services/provider-connection.service';
import { agentService } from '@/services/agent.service';
import { catalogService } from '@/services/catalog.service';
import { phoneNumberService } from '@/services/phone-number.service';
import { knowledgeBaseService } from '@/services/knowledge-base.service';
import { providerConnectionRepository } from '@/lib/db/repositories/provider-connection.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { mapOmniDimensionError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ensureDatabaseReady } from '@/lib/db/client';

describe('VoiceNuvo — Phase 3.1: Live OmniDimension Provider Verification', () => {
  const apiKey = process.env.OMNIDIM_API_KEY;
  const isKeyAvailable = Boolean(apiKey && apiKey.trim().length > 0);

  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userId = 'd0000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    await ensureDatabaseReady();
    // Ensure the global mock is cleared so calls hit real OmniDimension
    setGlobalMockVoiceProvider(null);
  });

  afterEach(async () => {
    setGlobalMockVoiceProvider(null);
  });

  describe('Credential Safety & Key Availability (Section 1)', () => {
    it('accurately detects whether OMNIDIM_API_KEY is present without leaking secrets', () => {
      if (!isKeyAvailable) {
        // Must report BLOCKED condition
        expect(process.env.OMNIDIM_API_KEY).toBeUndefined();
      } else {
        expect(apiKey).toBeDefined();
        expect(apiKey!.length).toBeGreaterThan(5);
      }
    });
  });

  describe.skipIf(!isKeyAvailable)('Real OmniDimension Provider Operations (Sections 2 - 16)', () => {
    // ==========================================
    // 2. Verify SDK Initialization (Section 2)
    // ==========================================
    it('initializes official @omnidim-ai/sdk through getOmniDimensionClient and OmniDimensionProvider', () => {
      const sdkClient = getOmniDimensionClient(apiKey!);
      expect(sdkClient).toBeDefined();

      const provider = new OmniDimensionProvider(apiKey!);
      expect(provider).toBeInstanceOf(OmniDimensionProvider);
      expect(provider.providerName).toBe('OMNIDIMENSION');
    });

    // ==========================================
    // 3. Real Connection Test (Section 3)
    // ==========================================
    it('executes a real authenticated OmniDimension connection verification', async () => {
      const provider = new OmniDimensionProvider(apiKey!);
      const conn = await provider.testConnection();

      expect(conn.success).toBe(true);
      expect(conn.latencyMs).toBeGreaterThan(0);
      expect(typeof conn.message).toBe('string');
    });

    // ==========================================
    // 4. Test Organization Connection (Section 4)
    // ==========================================
    it('connects test organization, verifies via live request, and encrypts secret', async () => {
      const status = await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userId,
        apiKey!,
        'Acme Live OmniDimension'
      );

      expect(status.connected).toBe(true);
      expect(status.status).toBe('ACTIVE');
      expect(status.provider).toBe('OMNIDIMENSION');
      expect(status.maskedKey).toBeDefined();
      expect(status.maskedKey).toContain('••••');

      // Verify DB stored encrypted ciphertext, never raw key
      const stored = await providerConnectionRepository.findByOrganizationId(orgAId);
      expect(stored).not.toBeNull();
      expect(stored?.encrypted_credentials).not.toContain(apiKey);
      expect(stored?.encrypted_credentials).toContain(':'); // IV:tag:cipher format
    });

    // ==========================================
    // 5. Test Invalid Key Replacement (Section 5)
    // ==========================================
    it('refuses invalid replacement key and keeps old valid connection active', async () => {
      // Org A is currently connected with valid apiKey from Section 4
      const initialStatus = await providerConnectionService.getConnectionStatus(orgAId);
      expect(initialStatus.connected).toBe(true);

      // Attempt to replace with deliberately invalid key
      let errorMessage = '';
      try {
        await providerConnectionService.saveOrUpdateConnection(
          orgAId,
          userId,
          'sk_live_deliberately_invalid_token_99999'
        );
      } catch (err) {
        errorMessage = (err as Error).message;
      }

      // Must fail with safe replacement error
      expect(errorMessage).toContain('New API connection failed — old connection is still active');

      // Verify old connection is still active and valid
      const statusAfter = await providerConnectionService.getConnectionStatus(orgAId);
      expect(statusAfter.connected).toBe(true);
      expect(statusAfter.status).toBe('ACTIVE');

      // Verify audit log recorded the failure without logging the secret
      const logs = await auditRepository.listByOrg(orgAId);
      const failLog = logs.find((l) => l.action === 'PROVIDER_CONNECTION_FAILED');
      expect(failLog).toBeDefined();
      expect(JSON.stringify(failLog)).not.toContain('sk_live_deliberately_invalid_token_99999');
    });

    // ==========================================
    // 6. Real Agent List (Section 6)
    // ==========================================
    it('fetches real agent list from OmniDimension', async () => {
      const agents = await agentService.listAgents(orgAId);
      expect(Array.isArray(agents)).toBe(true);
    });

    // ==========================================
    // 7 - 10. Real Agent Lifecycle: Create, Read, Update, Delete (Sections 7, 8, 9, 10)
    // ==========================================
    it('executes real agent lifecycle: create, read, update, delete', async () => {
      const agentName = 'VoiceNuvo Integration Test Agent';

      // 7. Create Agent
      const created = await agentService.createAgent(orgAId, userId, {
        name: agentName,
        welcomeMessage: 'Hello, this is a VoiceNuvo integration test agent.',
        voiceName: 'Rachel',
        voiceProvider: 'elevenlabs',
        model: 'gpt-4o-mini',
        speechSpeed: 1.0,
        enableWebSearch: false,
        voicemailEnabled: false,
        maxDurationSec: 300,
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe(agentName);

      // Verify local control plane mapping record
      const localRecord = await voiceAgentRepository.findById(created.id, orgAId);
      expect(localRecord).not.toBeNull();
      expect(localRecord?.provider_agent_id).toBeDefined();
      expect(localRecord?.organization_id).toBe(orgAId);

      const createdId = created.id;

      try {
        // 8. Read Agent
        const fetched = await agentService.getAgent(orgAId, createdId);
        expect(fetched.id).toBe(createdId);
        expect(fetched.name).toBe(agentName);

        // 9. Update Agent (Section 9: modify one safe configuration field)
        const updatedName = 'VoiceNuvo Integration Test Agent Updated';
        const updated = await agentService.updateAgent(orgAId, userId, createdId, {
          name: updatedName,
        });

        expect(updated.name).toBe(updatedName);

        // Verify read back reflects update
        const fetchedUpdated = await agentService.getAgent(orgAId, createdId);
        expect(fetchedUpdated.name).toBe(updatedName);
      } finally {
        // 10. Delete Agent
        const deleteResult = await agentService.deleteAgent(orgAId, userId, createdId);
        expect(deleteResult.success).toBe(true);

        // Verify local record removed
        const deletedAgent = await voiceAgentRepository.findById(createdId, orgAId);
        expect(deletedAgent).toBeNull();
      }
    });

    // ==========================================
    // 11. Real Provider Catalog (Section 11)
    // ==========================================
    it('retrieves and maps real provider catalog (LLM, voice, STT, TTS)', async () => {
      const catalog = await catalogService.getCatalog(orgAId);

      expect(Array.isArray(catalog.llms)).toBe(true);
      expect(Array.isArray(catalog.voices)).toBe(true);
      expect(Array.isArray(catalog.stt)).toBe(true);
      expect(Array.isArray(catalog.tts)).toBe(true);

      expect(catalog.llms.length).toBeGreaterThan(0);
      expect(catalog.voices.length).toBeGreaterThan(0);
      expect(catalog.stt.length).toBeGreaterThan(0);
      expect(catalog.tts.length).toBeGreaterThan(0);
    });

    // ==========================================
    // 12. Real Phone Number List (Section 12)
    // ==========================================
    it('calls actual provider phone number listing operation without purchasing', async () => {
      const numbers = await phoneNumberService.listNumbers(orgAId);
      expect(Array.isArray(numbers)).toBe(true);
    });

    // ==========================================
    // 13. Knowledge Base Verification (Section 13)
    // ==========================================
    it('tests knowledge base lifecycle if quota allows, or skips safely', async () => {
      const provider = new OmniDimensionProvider(apiKey!);
      let quota: { canUpload: boolean; message?: string; quotaRemaining?: number } = { canUpload: false };
      try {
        quota = await provider.canUploadFile(512, 'integration_test_doc.pdf');
      } catch (err) {
        console.warn(`[KB TEST] SKIPPED: ${(err as Error).message}`);
        return;
      }

      if (!quota.canUpload) {
        console.warn(`[KB TEST] SKIPPED: ${quota.message || 'Quota unavailable'}`);
        return;
      }

      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF'
      );

      const uploaded = await knowledgeBaseService.uploadFile(orgAId, userId, {
        filename: 'integration_test_doc.pdf',
        mimeType: 'application/pdf',
        content: minimalPdf,
        fileSizeBytes: minimalPdf.length,
      });

      expect(uploaded.id).toBeDefined();

      // Clean up test file
      const del = await knowledgeBaseService.deleteFile(orgAId, userId, uploaded.id);
      expect(del.success).toBe(true);
    });

    // ==========================================
    // 14. Tenant Isolation with Real Provider (Section 14)
    // ==========================================
    it('strictly isolates tenant resources between Tenant A and Tenant B', async () => {
      // Setup Org B connection with same test key
      await providerConnectionService.saveOrUpdateConnection(
        orgBId,
        userId,
        apiKey!,
        'Globex Live OmniDimension'
      );

      // Create Agent in Org A
      const agentA = await agentService.createAgent(orgAId, userId, {
        name: 'Tenant A Isolation Test Agent',
      });

      try {
        // Tenant B cannot read Tenant A agent
        await expect(agentService.getAgent(orgBId, agentA.id)).rejects.toThrow(
          'Agent not found or does not belong to your organization.'
        );

        // Tenant B cannot update Tenant A agent
        await expect(
          agentService.updateAgent(orgBId, userId, agentA.id, { name: 'Compromised Name' })
        ).rejects.toThrow('Agent not found or does not belong to your organization.');

        // Tenant B cannot delete Tenant A agent
        await expect(agentService.deleteAgent(orgBId, userId, agentA.id)).rejects.toThrow(
          'Agent not found or does not belong to your organization.'
        );
      } finally {
        await agentService.deleteAgent(orgAId, userId, agentA.id);
      }
    });

    // ==========================================
    // 15. Secret Verification (Section 15)
    // ==========================================
    it('never exposes raw API secret in connection status or audit logs', async () => {
      const statusA = await providerConnectionService.getConnectionStatus(orgAId);
      const jsonStatus = JSON.stringify(statusA);

      expect(jsonStatus).not.toContain(apiKey);
      expect(jsonStatus).toContain('••••');

      const logs = await auditRepository.listByOrg(orgAId);
      const jsonLogs = JSON.stringify(logs);
      expect(jsonLogs).not.toContain(apiKey);
    });

    // ==========================================
    // 16. Error Mapping Test (Section 16)
    // ==========================================
    it('normalizes provider errors into VoiceProviderError without exposing secrets or stack traces', async () => {
      const provider = new OmniDimensionProvider(apiKey!);

      try {
        // Intentionally call non-existent agent on provider
        await provider.getAgent('non_existent_provider_agent_999999');
        expect.unreachable('Should have thrown an error');
      } catch (err) {
        const mapped = mapOmniDimensionError(err);
        expect(mapped.code).toMatch(/PROVIDER_/);
        expect(mapped.message).not.toContain(apiKey);
        expect(JSON.stringify(mapped)).not.toContain('Authorization');
      }
    });
  });
});
