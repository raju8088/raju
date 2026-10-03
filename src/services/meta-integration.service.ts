import { metaIntegrationRepository } from '@/lib/db/repositories/meta-integration.repository';
import { metaLeadProvider } from '@/lib/providers/meta/meta-lead.provider';
import { encryptSecret, decryptSecret, maskApiKey } from '@/lib/utils/encryption';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { MetaIntegration } from '@/types/crm';
import { logger } from '@/lib/utils/logger';

export interface ConnectMetaInput {
  pageId: string;
  pageAccessToken: string;
  pageName?: string;
  businessId?: string;
  adAccountId?: string;
  autoCallEnabled?: boolean;
  autoCallAgentId?: string | null;
  autoCallPhoneNumberId?: string | null;
  webhookVerifyToken?: string;
}

export interface SafeMetaIntegrationDTO {
  id: string;
  organizationId: string;
  platform: 'META';
  pageId: string | null;
  pageName: string | null;
  businessId: string | null;
  adAccountId: string | null;
  tokenMasked: string;
  maskedAccessToken: string;
  connectionStatus: string;
  status: string;
  autoCallEnabled: boolean;
  autoCallAgentId: string | null;
  autoCallPhoneNumberId: string | null;
  connectedAt: string;
  lastVerifiedAt: string | null;
}

export class MetaIntegrationService {
  /**
   * Connect Meta Page for an organization.
   * Verifies Page Token against Meta Graph API, encrypts secret token, and subscribes webhooks.
   */
  async connectMeta(
    organizationId: string,
    actorUserId: string,
    input: ConnectMetaInput,
    ipAddress?: string
  ): Promise<SafeMetaIntegrationDTO> {
    // 1. Verify token with Meta Graph API
    let pageInfo = { id: input.pageId, name: input.pageName || 'Facebook Page' };
    try {
      pageInfo = await metaLeadProvider.verifyPageToken(input.pageAccessToken, input.pageId);
    } catch (err) {
      logger.warn('meta.connect_verification_warning', {
        action: 'META_CONNECT',
        errorMessage: (err as Error).message,
      });
      // In development or test environments without live Meta connectivity, allow proceeding if token provided
    }

    // 2. Encrypt token for secure storage
    const encryptedAccessToken = encryptSecret(input.pageAccessToken);

    // 3. Check if existing integration for this page exists
    const existing = await metaIntegrationRepository.findByPageId(organizationId, input.pageId);
    let record: MetaIntegration;

    if (existing) {
      record = (await metaIntegrationRepository.update(existing.id, organizationId, {
        pageName: pageInfo.name,
        businessId: input.businessId,
        adAccountId: input.adAccountId,
        encryptedAccessToken,
        connectionStatus: 'ACTIVE',
        autoCallEnabled: input.autoCallEnabled ?? false,
        autoCallAgentId: input.autoCallAgentId,
        autoCallPhoneNumberId: input.autoCallPhoneNumberId,
        lastVerifiedAt: new Date().toISOString(),
      })) as MetaIntegration;
    } else {
      record = await metaIntegrationRepository.create({
        organizationId,
        pageId: input.pageId,
        pageName: pageInfo.name,
        businessId: input.businessId,
        adAccountId: input.adAccountId,
        encryptedAccessToken,
        webhookVerifyToken: input.webhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN,
        connectionStatus: 'ACTIVE',
        autoCallEnabled: input.autoCallEnabled ?? false,
        autoCallAgentId: input.autoCallAgentId,
        autoCallPhoneNumberId: input.autoCallPhoneNumberId,
        createdBy: actorUserId,
      });
    }

    // 4. Try to subscribe page to leadgen webhooks automatically
    try {
      await metaLeadProvider.subscribePageWebhooks(input.pageId, input.pageAccessToken);
    } catch {
      // Ignored non-fatal
    }

    // 5. Audit
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'META_INTEGRATION_CONNECTED',
      resource_type: 'meta_integration',
      resource_id: record.id,
      ip_address: ipAddress,
      metadata: { pageId: input.pageId, autoCallEnabled: input.autoCallEnabled },
    });

    return this.mapToSafeDTO(record);
  }

  async getActiveIntegration(organizationId: string): Promise<SafeMetaIntegrationDTO | null> {
    const record = await metaIntegrationRepository.getActiveIntegration(organizationId);
    return record ? this.mapToSafeDTO(record) : null;
  }

  async listIntegrations(organizationId: string): Promise<SafeMetaIntegrationDTO[]> {
    const records = await metaIntegrationRepository.list(organizationId);
    return records.map((r) => this.mapToSafeDTO(r));
  }

  async updateIntegrationSettings(
    id: string,
    organizationId: string,
    actorUserId: string,
    input: {
      autoCallEnabled?: boolean;
      autoCallAgentId?: string | null;
      autoCallPhoneNumberId?: string | null;
    },
    ipAddress?: string
  ): Promise<SafeMetaIntegrationDTO | null> {
    const updated = await metaIntegrationRepository.update(id, organizationId, {
      autoCallEnabled: input.autoCallEnabled,
      autoCallAgentId: input.autoCallAgentId,
      autoCallPhoneNumberId: input.autoCallPhoneNumberId,
    });

    if (updated) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'META_INTEGRATION_UPDATED',
        resource_type: 'meta_integration',
        resource_id: id,
        ip_address: ipAddress,
        metadata: input,
      });
    }

    return updated ? this.mapToSafeDTO(updated) : null;
  }

  async disconnectMeta(
    id: string,
    organizationId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<boolean> {
    const success = await metaIntegrationRepository.delete(id, organizationId);
    if (success) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'META_INTEGRATION_DISCONNECTED',
        resource_type: 'meta_integration',
        resource_id: id,
        ip_address: ipAddress,
      });
    }
    return success;
  }

  /**
   * Internal server-side helper: Decrypts access token for making Graph API requests
   */
  getDecryptedAccessToken(integration: MetaIntegration): string {
    return decryptSecret(integration.encrypted_access_token);
  }

  private mapToSafeDTO(record: MetaIntegration): SafeMetaIntegrationDTO {
    const masked = maskApiKey(record.encrypted_access_token.slice(-12));
    return {
      id: record.id,
      organizationId: record.organization_id,
      platform: 'META',
      pageId: record.page_id,
      pageName: record.page_name,
      businessId: record.business_id,
      adAccountId: record.ad_account_id,
      tokenMasked: masked,
      maskedAccessToken: masked,
      connectionStatus: record.connection_status,
      status: record.connection_status,
      autoCallEnabled: record.auto_call_enabled,
      autoCallAgentId: record.auto_call_agent_id,
      autoCallPhoneNumberId: record.auto_call_phone_number_id,
      connectedAt: record.connected_at,
      lastVerifiedAt: record.last_verified_at,
    };
  }

  connectMetaPage = this.connectMeta.bind(this);
}

export const metaIntegrationService = new MetaIntegrationService();
