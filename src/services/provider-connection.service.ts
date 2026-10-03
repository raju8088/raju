import { providerConnectionRepository } from '@/lib/db/repositories/provider-connection.repository';
import { encryptSecret, decryptSecret, maskApiKey } from '@/lib/utils/encryption';
import { OmniDimensionProvider } from '@/lib/providers/voice/omnidimension/omnidimension.provider';
import { MockVoiceProvider } from '@/lib/providers/voice/mock.provider';
import type { VoiceProvider } from '@/lib/providers/voice/provider-types';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { logger } from '@/lib/utils/logger';

export interface ProviderConnectionStatusDTO {
  provider: 'OMNIDIMENSION';
  displayName: string;
  connected: boolean;
  status: 'ACTIVE' | 'FAILED' | 'SUSPENDED' | 'REMOVED' | 'NOT_CONNECTED';
  maskedKey?: string;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

// Global provider mock hook for integration tests
export let globalMockVoiceProvider: MockVoiceProvider | null = null;
export function setGlobalMockVoiceProvider(mock: MockVoiceProvider | null) {
  globalMockVoiceProvider = mock;
}

export class ProviderConnectionService {
  /**
   * Safe status query: Never returns the raw encrypted credentials
   */
  async getConnectionStatus(organizationId: string): Promise<ProviderConnectionStatusDTO> {
    const conn = await providerConnectionRepository.findByOrganizationId(organizationId);
    if (!conn) {
      return {
        provider: 'OMNIDIMENSION',
        displayName: 'OmniDimension Voice',
        connected: false,
        status: 'NOT_CONNECTED',
        lastVerifiedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      };
    }

    let maskedKey = '••••••••';
    try {
      const raw = decryptSecret(conn.encrypted_credentials);
      maskedKey = maskApiKey(raw);
    } catch {
      // Ignore decryption error for display
    }

    return {
      provider: conn.provider,
      displayName: conn.display_name,
      connected: conn.status === 'ACTIVE',
      status: conn.status,
      maskedKey,
      lastVerifiedAt: conn.last_verified_at,
      lastErrorCode: conn.last_error_code,
      lastErrorMessage: conn.last_error_message,
    };
  }

  /**
   * Resolves the active VoiceProvider for an organization
   */
  async getProviderForOrganization(organizationId: string): Promise<VoiceProvider> {
    if (globalMockVoiceProvider) {
      return globalMockVoiceProvider;
    }

    const conn = await providerConnectionRepository.findByOrganizationId(organizationId);
    if (!conn || conn.status !== 'ACTIVE') {
      throw new Error('OmniDimension voice provider is not connected for this organization.');
    }

    const apiKey = decryptSecret(conn.encrypted_credentials);
    return new OmniDimensionProvider(apiKey);
  }

  /**
   * Tests an API key against OmniDimension without saving
   */
  async testApiKey(apiKey: string): Promise<{ success: boolean; message?: string; latencyMs?: number }> {
    if (globalMockVoiceProvider) {
      return globalMockVoiceProvider.testConnection();
    }
    const tempProvider = new OmniDimensionProvider(apiKey);
    return await tempProvider.testConnection();
  }

  /**
   * Connect or replace OmniDimension API key.
   * STRICT RULE (Section 7 & 34): If new connection test fails, PRESERVE old active connection!
   */
  async saveOrUpdateConnection(
    organizationId: string,
    actorUserId: string,
    newApiKey: string,
    displayName: string = 'OmniDimension Voice'
  ): Promise<ProviderConnectionStatusDTO> {
    return this.saveConnection(organizationId, actorUserId, newApiKey, displayName);
  }

  async saveConnection(
    organizationId: string,
    actorUserId: string,
    newApiKey: string,
    displayName: string = 'OmniDimension Voice'
  ): Promise<ProviderConnectionStatusDTO> {
    const existing = await providerConnectionRepository.findByOrganizationId(organizationId);

    // 1. Test new key before modifying existing connection
    const testResult = await this.testApiKey(newApiKey);

    if (!testResult.success) {
      logger.warn('provider.connection_test_failed', {
        action: 'PROVIDER_CONNECTION_FAILED',
        organization: { id: organizationId },
        errorMessage: testResult.message,
      });

      // Audit failed connection attempt
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'PROVIDER_CONNECTION_FAILED',
        resource_type: 'provider_connection',
        metadata: {
          provider: 'OMNIDIMENSION',
          reason: testResult.message,
          preservedExistingConnection: Boolean(existing && existing.status === 'ACTIVE'),
        },
      });

      // Section 7 & 34: Fail cleanly and do NOT replace working connection
      throw new Error(`New API connection failed — old connection is still active. Reason: ${testResult.message}`);
    }

    // 2. Encrypt credential at rest
    const encrypted = encryptSecret(newApiKey.trim());

    // 3. Save / Upsert
    const saved = await providerConnectionRepository.upsert({
      organizationId,
      provider: 'OMNIDIMENSION',
      displayName,
      encryptedCredentials: encrypted,
      status: 'ACTIVE',
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    const action = existing ? 'PROVIDER_CONNECTION_REPLACED' : 'PROVIDER_CONNECTION_CREATED';
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action,
      resource_type: 'provider_connection',
      resource_id: saved.id,
      metadata: {
        provider: 'OMNIDIMENSION',
        status: 'ACTIVE',
        latencyMs: testResult.latencyMs,
      },
    });

    return this.getConnectionStatus(organizationId);
  }

  /**
   * Disconnect voice provider for organization
   */
  async disconnect(organizationId: string, actorUserId: string): Promise<boolean> {
    const success = await providerConnectionRepository.delete(organizationId);
    if (success) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'PROVIDER_CONNECTION_DISCONNECTED',
        resource_type: 'provider_connection',
        metadata: { provider: 'OMNIDIMENSION' },
      });
    }
    return success;
  }
}

export const providerConnectionService = new ProviderConnectionService();
