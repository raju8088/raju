import { voiceAgentRepository, type VoiceAgentRecord } from '@/lib/db/repositories/voice-agent.repository';
import { providerConnectionService } from './provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  NormalizedAgent,
  NormalizedAgentVersion,
} from '@/lib/providers/voice/provider-types';

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
   * List all agents belonging to the organization
   */
  async listAgents(organizationId: string): Promise<NormalizedAgent[]> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const localAgents = await voiceAgentRepository.findByOrganizationId(organizationId);

    // Fetch live provider agents
    const { agents: providerAgents } = await provider.listAgents();

    // Map and filter: match local mappings with provider agents
    const localByProviderId = new Map(localAgents.map((a) => [a.provider_agent_id, a]));

    return providerAgents
      .filter((pa) => localByProviderId.has(pa.id))
      .map((pa) => {
        const local = localByProviderId.get(pa.id)!;
        return {
          ...pa,
          id: local.id, // Expose VoiceNuvo UUID to frontend
          name: local.name || pa.name,
          status: local.status || pa.status,
        };
      });
  }

  /**
   * Retrieve single agent by VoiceNuvo ID
   */
  async getAgent(organizationId: string, agentId: string): Promise<NormalizedAgent> {
    const local = await this.resolveLocalAgent(organizationId, agentId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    const liveAgent = await provider.getAgent(local.provider_agent_id);
    return {
      ...liveAgent,
      id: local.id,
      name: local.name || liveAgent.name,
    };
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
    const local = await voiceAgentRepository.create({
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
