import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, maskApiKey } from '@/lib/utils/encryption';
import { mapOmniDimensionError, VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { MockVoiceProvider } from '@/lib/providers/voice/mock.provider';
import {
  providerConnectionService,
  setGlobalMockVoiceProvider,
} from '@/services/provider-connection.service';
import { agentService } from '@/services/agent.service';
import { knowledgeBaseService } from '@/services/knowledge-base.service';
import { phoneNumberService } from '@/services/phone-number.service';
import { catalogService } from '@/services/catalog.service';
import { providerConnectionRepository } from '@/lib/db/repositories/provider-connection.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { knowledgeFileRepository } from '@/lib/db/repositories/knowledge-file.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { OmniDimensionProvider } from '@/lib/providers/voice/omnidimension/omnidimension.provider';

describe('VoiceNuvo — Phase 3: OmniDimension Integration Tests', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminId = 'd0000000-0000-0000-0000-000000000002';
  let mockProvider: MockVoiceProvider;

  beforeEach(() => {
    mockProvider = new MockVoiceProvider();
    setGlobalMockVoiceProvider(mockProvider);
  });

  afterEach(async () => {
    setGlobalMockVoiceProvider(null);
    // Cleanup any created database records for the test orgs
    try {
      await providerConnectionRepository.delete(orgAId);
      await providerConnectionRepository.delete(orgBId);
    } catch {
      // Ignore cleanup error
    }
  });

  // ==========================================
  // 1. API Key Security & Encryption (Section 6, 8)
  // ==========================================
  describe('API Key Security & Encryption', () => {
    it('encrypts secrets at rest using AES-256-GCM and decrypts accurately', () => {
      const plainApiKey = 'sk_live_omnidim_secret_token_1234567890';
      const encrypted = encryptSecret(plainApiKey);

      expect(encrypted).not.toEqual(plainApiKey);
      expect(encrypted).toContain(':'); // IV : AuthTag : Ciphertext

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toEqual(plainApiKey);
    });

    it('masks API keys safely without revealing the raw token', () => {
      const masked = maskApiKey('sk_live_1234567890abcdef');
      expect(masked).toBe('••••••••cdef');
      expect(masked).not.toContain('1234567890ab');

      const shortMasked = maskApiKey('short');
      expect(shortMasked).toBe('••••••••');
    });

    it('never exposes raw credentials in getConnectionStatus', async () => {
      // Connect Org A
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_omnidim_api_key_org_a'
      );

      const status = await providerConnectionService.getConnectionStatus(orgAId);
      expect(status.connected).toBe(true);
      expect(status.status).toBe('ACTIVE');
      expect(status.provider).toBe('OMNIDIMENSION');
      expect(status.maskedKey).toBeDefined();
      expect(status.maskedKey).toContain('••••');
      // Assert raw key is completely absent from status DTO
      expect(JSON.stringify(status)).not.toContain('valid_omnidim_api_key_org_a');
    });
  });

  // ==========================================
  // 2. Safe Connection Management & Replacement (Section 7, 34)
  // ==========================================
  describe('Connection Lifecycle & Safe Replacement', () => {
    it('successfully creates and verifies a valid connection', async () => {
      const result = await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key_initial'
      );

      expect(result.connected).toBe(true);
      expect(result.status).toBe('ACTIVE');

      // Verify audit log was recorded
      const logs = await auditRepository.listByOrg(orgAId);
      const connLog = logs.find((l) => l.action === 'PROVIDER_CONNECTION_CREATED');
      expect(connLog).toBeDefined();
    });

    it('preserves existing active connection when a new API key fails verification', async () => {
      // 1. Establish initial working connection
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_initial_key'
      );

      const beforeStatus = await providerConnectionService.getConnectionStatus(orgAId);
      expect(beforeStatus.connected).toBe(true);

      // 2. Attempt replacement with an invalid key that fails connection test
      mockProvider.shouldFailConnection = true;

      await expect(
        providerConnectionService.saveOrUpdateConnection(
          orgAId,
          userAdminId,
          'invalid_bad_key'
        )
      ).rejects.toThrow('New API connection failed — old connection is still active');

      // 3. Confirm the existing connection remains ACTIVE and intact
      const afterStatus = await providerConnectionService.getConnectionStatus(orgAId);
      expect(afterStatus.connected).toBe(true);
      expect(afterStatus.status).toBe('ACTIVE');

      // 4. Verify failure audit log was recorded
      const logs = await auditRepository.listByOrg(orgAId);
      const failLog = logs.find((l) => l.action === 'PROVIDER_CONNECTION_FAILED');
      expect(failLog).toBeDefined();
    });

    it('can cleanly disconnect a provider connection', async () => {
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key'
      );

      const disconnected = await providerConnectionService.disconnect(orgAId, userAdminId);
      expect(disconnected).toBe(true);

      const status = await providerConnectionService.getConnectionStatus(orgAId);
      expect(status.connected).toBe(false);
      expect(status.status).toBe('NOT_CONNECTED');
    });
  });

  // ==========================================
  // 3. Error Normalization (Section 29)
  // ==========================================
  describe('Provider Error Normalization', () => {
    it('normalizes HTTP 401 / 403 to PROVIDER_AUTH_FAILED', () => {
      const err = mapOmniDimensionError({ status: 401, message: 'Invalid token' });
      expect(err).toBeInstanceOf(VoiceProviderError);
      expect(err.code).toBe('PROVIDER_AUTH_FAILED');
      expect(err.httpStatus).toBe(401);
    });

    it('normalizes HTTP 429 to PROVIDER_RATE_LIMITED', () => {
      const err = mapOmniDimensionError({ status: 429, message: 'Too many requests' });
      expect(err.code).toBe('PROVIDER_RATE_LIMITED');
      expect(err.httpStatus).toBe(429);
    });

    it('normalizes HTTP 404 to PROVIDER_NOT_FOUND', () => {
      const err = mapOmniDimensionError({ status: 404, message: 'Agent not found' });
      expect(err.code).toBe('PROVIDER_NOT_FOUND');
      expect(err.httpStatus).toBe(404);
    });

    it('normalizes timeouts to PROVIDER_TIMEOUT', () => {
      const err = mapOmniDimensionError(new Error('ETIMEDOUT connection timed out'));
      expect(err.code).toBe('PROVIDER_TIMEOUT');
    });
  });

  // ==========================================
  // 4. Voice Agents Module (Section 11 - 17)
  // ==========================================
  describe('Voice Agents Service & Version Control', () => {
    beforeEach(async () => {
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key_org_a'
      );
    });

    it('creates, lists, retrieves, updates, and deletes an agent', async () => {
      // 1. Create agent
      const agent = await agentService.createAgent(orgAId, userAdminId, {
        name: 'Support Concierge',
        welcomeMessage: 'Hello! Welcome to VoiceNuvo support.',
        voiceName: 'Rachel',
        voiceProvider: 'elevenlabs',
        model: 'gpt-4o-mini',
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Support Concierge');

      // 2. List agents
      const list = await agentService.listAgents(orgAId);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const found = list.find((a) => a.id === agent.id);
      expect(found).toBeDefined();

      // 3. Get single agent
      const single = await agentService.getAgent(orgAId, agent.id);
      expect(single.name).toBe('Support Concierge');

      // 4. Update agent
      const updated = await agentService.updateAgent(orgAId, userAdminId, agent.id, {
        name: 'Support Concierge Senior',
        speechSpeed: 1.1,
      });
      expect(updated.name).toBe('Support Concierge Senior');

      // 5. Version operations
      const version = await agentService.saveVersion(orgAId, userAdminId, agent.id, 'v1.0.0-release');
      expect(version.versionNumber).toBeDefined();
      expect(version.name).toBe('v1.0.0-release');

      const versions = await agentService.listVersions(orgAId, agent.id);
      expect(versions.length).toBeGreaterThanOrEqual(1);

      const restoreResult = await agentService.restoreVersion(orgAId, userAdminId, agent.id, version.versionNumber);
      expect(restoreResult.success).toBe(true);

      // 6. Delete agent
      const deleteResult = await agentService.deleteAgent(orgAId, userAdminId, agent.id);
      expect(deleteResult.success).toBe(true);

      // Verify deletion from local database
      const afterDelete = await voiceAgentRepository.findById(agent.id, orgAId);
      expect(afterDelete).toBeNull();
    });

    it('enforces tenant isolation: Organization B cannot access Organization A agents', async () => {
      // Agent created under Org A
      const agentA = await agentService.createAgent(orgAId, userAdminId, {
        name: 'Org A Exclusive Agent',
      });

      // Connect Org B
      await providerConnectionService.saveOrUpdateConnection(
        orgBId,
        userAdminId,
        'valid_key_org_b'
      );

      // Org B attempts to retrieve Org A agent
      await expect(agentService.getAgent(orgBId, agentA.id)).rejects.toThrow(
        'Agent not found or does not belong to your organization.'
      );

      // Org B attempts to update Org A agent
      await expect(
        agentService.updateAgent(orgBId, userAdminId, agentA.id, { name: 'Hacked' })
      ).rejects.toThrow('Agent not found or does not belong to your organization.');

      // Org B attempts to delete Org A agent
      await expect(
        agentService.deleteAgent(orgBId, userAdminId, agentA.id)
      ).rejects.toThrow('Agent not found or does not belong to your organization.');
    });
  });

  // ==========================================
  // 5. Knowledge Base Module (Section 18 - 20)
  // ==========================================
  describe('Knowledge Base Service & Agent Attachments', () => {
    beforeEach(async () => {
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key_org_a'
      );
    });

    it('uploads, lists, attaches, detaches, and deletes knowledge files', async () => {
      // 1. Upload file
      const file = await knowledgeBaseService.uploadFile(orgAId, userAdminId, {
        filename: 'product-catalog.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('mock file binary content'),
        fileSizeBytes: 1024,
      });

      expect(file.id).toBeDefined();
      expect(file.filename).toBe('product-catalog.pdf');

      // 2. List files
      const files = await knowledgeBaseService.listFiles(orgAId);
      expect(files.some((f) => f.id === file.id)).toBe(true);

      // 3. Create an agent to attach to
      const agent = await agentService.createAgent(orgAId, userAdminId, {
        name: 'KB Agent',
      });

      // 4. Attach file to agent
      const attachRes = await knowledgeBaseService.attachFiles(orgAId, userAdminId, agent.id, [file.id]);
      expect(attachRes.success).toBe(true);

      // 5. Detach file from agent
      const detachRes = await knowledgeBaseService.detachFiles(orgAId, userAdminId, agent.id, [file.id]);
      expect(detachRes.success).toBe(true);

      // 6. Delete file
      const deleteRes = await knowledgeBaseService.deleteFile(orgAId, userAdminId, file.id);
      expect(deleteRes.success).toBe(true);

      // Verify deletion from local repository
      const localFile = await knowledgeFileRepository.findById(file.id, orgAId);
      expect(localFile).toBeNull();
    });

    it('enforces tenant isolation on knowledge files', async () => {
      const fileA = await knowledgeBaseService.uploadFile(orgAId, userAdminId, {
        filename: 'secret-a.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('confidential data'),
      });

      await providerConnectionService.saveOrUpdateConnection(
        orgBId,
        userAdminId,
        'valid_key_org_b'
      );

      // Org B attempts to delete Org A file
      await expect(
        knowledgeBaseService.deleteFile(orgBId, userAdminId, fileA.id)
      ).rejects.toThrow('Knowledge file not found or does not belong to your organization.');
    });
  });

  // ==========================================
  // 6. Phone Numbers Module (Section 21 - 24)
  // ==========================================
  describe('Phone Numbers Service & Telephony Inventory', () => {
    beforeEach(async () => {
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key_org_a'
      );
    });

    it('searches available numbers, purchases, attaches to agent, detaches, and releases', async () => {
      // 1. Search available numbers
      const available = await phoneNumberService.searchAvailable(orgAId, userAdminId, {
        region: 'US',
        carrier: 'Twilio',
      });
      expect(available.length).toBeGreaterThan(0);
      const candidate = available[0];

      // 2. Purchase number
      const purchased = await phoneNumberService.purchaseNumber(orgAId, userAdminId, {
        phoneNumber: candidate.phoneNumber,
        region: 'US',
        carrier: 'Twilio',
        idempotencyKey: 'idemp-test-12345',
      });

      expect(purchased.id).toBeDefined();
      expect(purchased.phoneNumber).toBe(candidate.phoneNumber);

      // 3. List my numbers
      const myNumbers = await phoneNumberService.listMyNumbers(orgAId);
      expect(myNumbers.some((n) => n.phoneNumber === purchased.phoneNumber)).toBe(true);

      // 4. Attach to agent
      const agent = await agentService.createAgent(orgAId, userAdminId, {
        name: 'Inbound Hotline Agent',
      });

      const attachRes = await phoneNumberService.attachToAgent(orgAId, userAdminId, purchased.id, agent.id);
      expect(attachRes.success).toBe(true);

      // Verify assignment in local database
      const assignedPhone = await phoneNumberRepository.findById(purchased.id, orgAId);
      expect(assignedPhone?.assigned_agent_id).toBe(agent.id);

      // 5. Detach from agent
      const detachRes = await phoneNumberService.detachFromAgent(orgAId, userAdminId, purchased.id);
      expect(detachRes.success).toBe(true);

      const unassignedPhone = await phoneNumberRepository.findById(purchased.id, orgAId);
      expect(unassignedPhone?.assigned_agent_id).toBeNull();

      // 6. Release number
      const releaseRes = await phoneNumberService.releaseNumber(orgAId, userAdminId, purchased.id);
      expect(releaseRes.success).toBe(true);

      const deletedPhone = await phoneNumberRepository.findById(purchased.id, orgAId);
      expect(deletedPhone).toBeNull();
    });

    it('enforces tenant isolation on phone numbers', async () => {
      const purchasedA = await phoneNumberService.purchaseNumber(orgAId, userAdminId, {
        phoneNumber: '+14155550199',
        region: 'US',
      });

      await providerConnectionService.saveOrUpdateConnection(
        orgBId,
        userAdminId,
        'valid_key_org_b'
      );

      // Org B attempts to release Org A phone number
      await expect(
        phoneNumberService.releaseNumber(orgBId, userAdminId, purchasedA.id)
      ).rejects.toThrow('Phone number not found or does not belong to your organization.');
    });
  });

  // ==========================================
  // 7. Provider Catalog (Section 25, 26)
  // ==========================================
  describe('Provider Catalog Service', () => {
    it('retrieves and caches LLM, voice, STT, and TTS catalogs', async () => {
      await providerConnectionService.saveOrUpdateConnection(
        orgAId,
        userAdminId,
        'valid_key_org_a'
      );

      const catalog1 = await catalogService.getCatalog(orgAId);
      expect(catalog1.llms.length).toBeGreaterThan(0);
      expect(catalog1.voices.length).toBeGreaterThan(0);
      expect(catalog1.stt.length).toBeGreaterThan(0);
      expect(catalog1.tts.length).toBeGreaterThan(0);

      // Second call returns cached result immediately
      const catalog2 = await catalogService.getCatalog(orgAId);
      expect(catalog2).toBe(catalog1);
    });
  });

  // ==========================================
  // 8. Real OmniDimension Provider Verification (Section 39)
  // ==========================================
  describe('Live OmniDimension Provider Integration (Optional)', () => {
    const liveApiKey = process.env.OMNIDIM_API_KEY;

    it.skipIf(!liveApiKey)(
      'executes live requests against real OmniDimension API when OMNIDIM_API_KEY is supplied',
      async () => {
        // Unset global mock to force live network client
        setGlobalMockVoiceProvider(null);

        const realProvider = new OmniDimensionProvider(liveApiKey!);

        // 1. Connection check
        const testConn = await realProvider.testConnection();
        if (!testConn.success) {
          console.error('[LIVE CONNECTION FAILED]:', testConn.message);
        }
        expect(testConn.success).toBe(true);

        // 2. List agents
        const agentList = await realProvider.listAgents({ limit: 5 });
        expect(agentList.agents).toBeDefined();

        // 3. Provider catalog
        const llms = await realProvider.listLLMs();
        expect(Array.isArray(llms)).toBe(true);

        // 4. Phone numbers list
        const phones = await realProvider.listPhoneNumbers();
        expect(Array.isArray(phones)).toBe(true);
      }
    );
  });
});
