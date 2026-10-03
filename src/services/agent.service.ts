import { voiceAgentRepository, type VoiceAgentRecord } from '@/lib/db/repositories/voice-agent.repository';
import { providerConnectionService } from './provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { logger } from '@/lib/utils/logger';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  NormalizedAgent,
  NormalizedAgentVersion,
} from '@/lib/providers/voice/provider-types';

export interface AgentSyncResult {
  success: boolean;
  providerAgentsCount: number;
  createdCount: number;
  updatedCount: number;
  pagesFetched: number;
  agents: NormalizedAgent[];
}

export class AgentService {
  /**
   * Resolves a local agent record ensuring organization ownership
   */
  private async resolveLocalAgent(organizationId: string, agentId: string): Promise<VoiceAgentRecord> {
    const local = await voiceAgentRepository.findById(agentId, organizationId);
    if (!local) {
      // Also try resolving by provider_agent_id within the organization
      const byProviderId = await voiceAgentRepository.findByProviderAgentId(organizationId, agentId);
      if (!byProviderId) {
        throw new Error('Agent not found or does not belong to your organization.');
      }
      return byProviderId;
    }
    return local;
  }

  /**
   * Synchronize all agents from OmniDimension provider into VoiceNuvo control plane.
   * - Traverses all provider pages (up to 150/page, safety limit 50 pages)
   * - Normalizes and upserts local voice_agents records
   * - Preserves existing records by updating safe metadata without creating duplicate rows
   * - Marks provider-removed agents INACTIVE (soft-removal, preserves call/campaign FKs)
   * - Guarantees strict multi-tenant organization isolation
   */
  async syncOrganizationAgents(
    organizationId: string,
    actorUserId?: string
  ): Promise<AgentSyncResult> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // 1. Fetch ALL agents across all pages from provider
    const { agents: providerAgents, pagesFetched } = provider.listAllAgents
      ? await provider.listAllAgents()
      : await (async () => {
          const res = await provider.listAgents({ limit: 150 });
          return { agents: res.agents, pagesFetched: 1 };
        })();

    // 2. Query existing local agents before sync
    const localBefore = await voiceAgentRepository.findByOrganizationId(organizationId);
    const localMap = new Map(localBefore.map((a) => [a.provider_agent_id, a]));

    let createdCount = 0;
    let updatedCount = 0;

    // 3. Upsert each provider agent into local mapping
    for (const pa of providerAgents) {
      if (localMap.has(pa.id)) {
        updatedCount++;
      } else {
        createdCount++;
      }

      await voiceAgentRepository.upsert({
        organizationId,
        provider: 'OMNIDIMENSION',
        providerAgentId: pa.id,
        name: pa.name || 'Unnamed Agent',
        status: pa.status || 'ACTIVE',
        isActive: true,
        metadata: {
          voiceId: pa.voiceId,
          voiceName: pa.voiceName,
          voiceProvider: pa.voiceProvider,
          model: pa.model,
          language: pa.language,
          welcomeMessage: pa.welcomeMessage,
          speechSpeed: pa.speechSpeed,
          enableWebSearch: pa.enableWebSearch,
          voicemailEnabled: pa.voicemailEnabled,
          voicemailMessage: pa.voicemailMessage,
          isEndCallEnabled: pa.isEndCallEnabled,
          endCallMessage: pa.endCallMessage,
          maxDurationSec: pa.maxDurationSec,
          assignedPhoneNumber: pa.assignedPhoneNumber,
        },
      });
    }

    // 4. Mark stale agents inactive (do not delete to preserve foreign key references)
    const activeProviderIds = providerAgents.map((pa) => pa.id);
    await voiceAgentRepository.markStaleAgents(organizationId, activeProviderIds, 'OMNIDIMENSION');

    // 5. Query updated local agents
    const localAfter = await voiceAgentRepository.findByOrganizationId(organizationId);
    const localAfterByProviderId = new Map(localAfter.map((a) => [a.provider_agent_id, a]));

    // 6. Safe telemetry logging (Section 18)
    logger.info('agent_sync.completed', {
      action: 'agent_sync.completed',
      organization: { id: organizationId },
      metadata: {
        provider_agent_pages: pagesFetched,
        provider_agents_received: providerAgents.length,
        local_agents_before_sync: localBefore.length,
        local_agents_created: createdCount,
        local_agents_updated: updatedCount,
        local_agents_total: localAfter.length,
      },
    });

    // 7. Audit log if actor provided
    if (actorUserId) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'AGENTS_SYNCED',
        resource_type: 'voice_agent',
        metadata: {
          provider: 'OMNIDIMENSION',
          providerAgentsReceived: providerAgents.length,
          pagesFetched,
          createdCount,
          updatedCount,
        },
      });
    }

    // Return normalized list
    const mappedAgents: NormalizedAgent[] = providerAgents.map((pa) => {
      const local = localAfterByProviderId.get(pa.id);
      return {
        ...pa,
        id: local ? local.id : pa.id,
        provider_agent_id: pa.id,
        provider: 'OMNIDIMENSION',
        name: local?.name || pa.name,
        status: local?.status || pa.status,
      };
    });

    return {
      success: true,
      providerAgentsCount: providerAgents.length,
      createdCount,
      updatedCount,
      pagesFetched,
      agents: mappedAgents,
    };
  }

  /**
   * List all agents belonging to the organization.
   * If forceRefresh is requested or if local mappings are empty with an active connection,
   * it synchronizes from OmniDimension with safe fallback to cached records if provider fails.
   */
  async listAgents(
    organizationId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<NormalizedAgent[]> {
    let localAgents = await voiceAgentRepository.findByOrganizationId(organizationId);

    // If forceRefresh requested, or local table is empty, attempt sync
    const shouldSync = Boolean(options?.forceRefresh || localAgents.length === 0);

    if (shouldSync) {
      try {
        const syncResult = await this.syncOrganizationAgents(organizationId);
        return syncResult.agents;
      } catch (err) {
        logger.warn('agent_sync.list_sync_failed_fallback', {
          action: 'agent_sync.list_sync_failed_fallback',
          organization: { id: organizationId },
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        // Section 27: Safe provider error fallback — do NOT wipe local agents!
        localAgents = await voiceAgentRepository.findByOrganizationId(organizationId);
      }
    }

    return localAgents
      .filter((la) => la.is_active)
      .map((la) => {
        const meta = (la.metadata || {}) as Record<string, unknown>;
        return {
          id: la.id,
          provider_agent_id: la.provider_agent_id,
          provider: la.provider,
          name: la.name,
          status: la.status,
          welcomeMessage: meta.welcomeMessage as string | undefined,
          voiceId: meta.voiceId as string | undefined,
          voiceName: meta.voiceName as string | undefined,
          voiceProvider: (meta.voiceProvider as string | undefined) || 'elevenlabs',
          model: (meta.model as string | undefined) || 'gpt-4o-mini',
          language: (meta.language as string | undefined) || 'English',
          speechSpeed: (meta.speechSpeed as number | undefined) ?? 1.0,
          enableWebSearch: Boolean(meta.enableWebSearch),
          voicemailEnabled: Boolean(meta.voicemailEnabled),
          voicemailMessage: meta.voicemailMessage as string | undefined,
          isEndCallEnabled: Boolean(meta.isEndCallEnabled),
          endCallMessage: meta.endCallMessage as string | undefined,
          maxDurationSec: (meta.maxDurationSec as number | undefined) ?? 600,
          assignedPhoneNumber: meta.assignedPhoneNumber as string | undefined,
          createdAt: la.created_at,
          updatedAt: la.updated_at,
        };
      });
  }

  /**
   * Retrieve single agent by VoiceNuvo ID
   */
  async getAgent(organizationId: string, agentId: string): Promise<NormalizedAgent> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    try {
      const liveAgent = await provider.getAgent(local.provider_agent_id);
      return {
        ...liveAgent,
        id: local.id,
        provider_agent_id: local.provider_agent_id,
        provider: local.provider,
        name: local.name || liveAgent.name,
      };
    } catch (err) {
      logger.warn('agent.get_live_failed_fallback', {
        action: 'agent.get_live_failed_fallback',
        organization: { id: organizationId },
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: { agentId },
      });
      const meta = (local.metadata || {}) as Record<string, unknown>;
      return {
        id: local.id,
        provider_agent_id: local.provider_agent_id,
        provider: local.provider,
        name: local.name,
        status: local.status,
        welcomeMessage: meta.welcomeMessage as string | undefined,
        voiceId: meta.voiceId as string | undefined,
        voiceName: meta.voiceName as string | undefined,
        voiceProvider: (meta.voiceProvider as string | undefined) || 'elevenlabs',
        model: (meta.model as string | undefined) || 'gpt-4o-mini',
        language: (meta.language as string | undefined) || 'English',
        speechSpeed: (meta.speechSpeed as number | undefined) ?? 1.0,
        enableWebSearch: Boolean(meta.enableWebSearch),
        voicemailEnabled: Boolean(meta.voicemailEnabled),
        voicemailMessage: meta.voicemailMessage as string | undefined,
        isEndCallEnabled: Boolean(meta.isEndCallEnabled),
        endCallMessage: meta.endCallMessage as string | undefined,
        maxDurationSec: (meta.maxDurationSec as number | undefined) ?? 600,
        assignedPhoneNumber: meta.assignedPhoneNumber as string | undefined,
        createdAt: local.created_at,
        updatedAt: local.updated_at,
      };
    }
  }

  /**
   * Create an agent on the provider and register local mapping
   */
  async createAgent(
    organizationId: string,
    actorUserId: string,
    input: CreateAgentInput
  ): Promise<NormalizedAgent> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // 1. Create on external provider
    const created = await provider.createAgent(input);

    // 2. Register local control plane metadata mapping
    const local = await voiceAgentRepository.upsert({
      organizationId,
      provider: 'OMNIDIMENSION',
      providerAgentId: created.id,
      name: input.name,
      status: created.status || 'ACTIVE',
      metadata: {
        voiceName: input.voiceName,
        voiceProvider: input.voiceProvider,
        model: input.model,
      },
    });

    // 3. Audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'AGENT_CREATED',
      resource_type: 'voice_agent',
      resource_id: local.id,
      metadata: {
        provider: 'OMNIDIMENSION',
        providerAgentId: created.id,
        name: input.name,
      },
    });

    return {
      ...created,
      id: local.id,
      provider_agent_id: created.id,
      provider: 'OMNIDIMENSION',
    };
  }

  /**
   * Update agent configuration
   */
  async updateAgent(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    input: UpdateAgentInput
  ): Promise<NormalizedAgent> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // Update on provider
    const updated = await provider.updateAgent(local.provider_agent_id, input);

    // Update local record
    await voiceAgentRepository.update(local.id, organizationId, {
      name: input.name,
      status: input.status,
    });

    // Audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'AGENT_UPDATED',
      resource_type: 'voice_agent',
      resource_id: local.id,
      metadata: {
        name: input.name,
        providerAgentId: local.provider_agent_id,
      },
    });

    return {
      ...updated,
      id: local.id,
    };
  }

  /**
   * Delete agent
   */
  async deleteAgent(
    organizationId: string,
    actorUserId: string,
    agentId: string
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // Delete on provider
    await provider.deleteAgent(local.provider_agent_id);

    // Delete local mapping
    await voiceAgentRepository.delete(local.id, organizationId);

    // Audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'AGENT_DELETED',
      resource_type: 'voice_agent',
      resource_id: local.id,
      metadata: {
        name: local.name,
        providerAgentId: local.provider_agent_id,
      },
    });

    return { success: true };
  }

  // Version Operations
  async listVersions(organizationId: string, agentId: string): Promise<NormalizedAgentVersion[]> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.listAgentVersions(local.provider_agent_id);
  }

  async saveVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    name?: string
  ): Promise<NormalizedAgentVersion> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    const version = await provider.saveAgentVersion(local.provider_agent_id, name);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'AGENT_VERSION_CREATED',
      resource_type: 'voice_agent',
      resource_id: local.id,
      metadata: {
        versionNumber: version.versionNumber,
        name: version.name,
      },
    });

    return version;
  }

  async restoreVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    versionNumber: number
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    const res = await provider.restoreAgentVersion(local.provider_agent_id, versionNumber);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'AGENT_VERSION_RESTORED',
      resource_type: 'voice_agent',
      resource_id: local.id,
      metadata: {
        versionNumber,
        restoredFrom: res.restoredFrom,
      },
    });

    return { success: res.success };
  }

  async diffVersion(organizationId: string, agentId: string, versionNumber: number): Promise<unknown> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.diffAgentVersion(local.provider_agent_id, versionNumber);
  }

  async renameVersion(
    organizationId: string,
    agentId: string,
    versionNumber: number,
    newName: string
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.renameAgentVersion(local.provider_agent_id, versionNumber, newName);
  }

  async deleteVersion(
    organizationId: string,
    agentId: string,
    versionNumber: number
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.deleteAgentVersion(local.provider_agent_id, versionNumber);
  }
}

export const agentService = new AgentService();
