import { phoneNumberRepository, type PhoneNumberRecord } from '@/lib/db/repositories/phone-number.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { providerConnectionService } from './provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import type {
  NormalizedPhoneNumber,
  SearchPhoneNumbersQuery,
  PurchasePhoneNumberInput,
} from '@/lib/providers/voice/provider-types';

export class PhoneNumberService {
  private async resolveLocalPhone(organizationId: string, phoneId: string): Promise<PhoneNumberRecord> {
    const local = await phoneNumberRepository.findById(phoneId, organizationId);
    if (!local) {
      throw new Error('Phone number not found or does not belong to your organization.');
    }
    return local;
  }

  async listNumbers(organizationId: string): Promise<(NormalizedPhoneNumber & { assignedAgentName?: string })[]> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const localPhones = await phoneNumberRepository.findByOrganizationId(organizationId);
    const localAgents = await voiceAgentRepository.findByOrganizationId(organizationId);
    const agentMap = new Map(localAgents.map((a) => [a.id, a.name]));

    const providerPhones = await provider.listPhoneNumbers();
    const localByNumber = new Map(localPhones.map((p) => [p.phone_number, p]));

    return providerPhones
      .filter((pp) => localByNumber.has(pp.phoneNumber))
      .map((pp) => {
        const local = localByNumber.get(pp.phoneNumber)!;
        return {
          ...pp,
          id: local.id,
          assignedAgentId: local.assigned_agent_id || undefined,
          assignedAgentName: local.assigned_agent_id ? agentMap.get(local.assigned_agent_id) : undefined,
        };
      });
  }

  async listMyNumbers(organizationId: string): Promise<(NormalizedPhoneNumber & { assignedAgentName?: string })[]> {
    return this.listNumbers(organizationId);
  }

  async searchAvailable(
    organizationId: string,
    actorUserId: string,
    query: SearchPhoneNumbersQuery
  ): Promise<NormalizedPhoneNumber[]> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const numbers = await provider.searchPhoneNumbers(query);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'PHONE_NUMBER_SEARCHED',
      metadata: { region: query.region, carrier: query.carrier, count: numbers.length },
    });

    return numbers;
  }

  async purchaseNumber(
    organizationId: string,
    actorUserId: string,
    input: PurchasePhoneNumberInput
  ): Promise<NormalizedPhoneNumber> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // 1. Purchase on provider
    const purchased = await provider.purchasePhoneNumber(input);

    // 2. Register local control plane metadata
    const local = await phoneNumberRepository.create({
      organizationId,
      provider: 'OMNIDIMENSION',
      providerPhoneId: purchased.id,
      phoneNumber: purchased.phoneNumber,
      region: purchased.region,
      status: 'ACTIVE',
    });

    // 3. Audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'PHONE_NUMBER_PURCHASED',
      resource_type: 'phone_number',
      resource_id: local.id,
      metadata: {
        phoneNumber: purchased.phoneNumber,
        region: purchased.region,
        carrier: input.carrier,
      },
    });

    return {
      ...purchased,
      id: local.id,
    };
  }

  async releaseNumber(
    organizationId: string,
    actorUserId: string,
    phoneId: string
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalPhone(organizationId, phoneId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    await provider.releasePhoneNumber(local.phone_number);
    await phoneNumberRepository.delete(local.id, organizationId);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'PHONE_NUMBER_RELEASED',
      resource_type: 'phone_number',
      resource_id: local.id,
      metadata: { phoneNumber: local.phone_number },
    });

    return { success: true };
  }

  async attachToAgent(
    organizationId: string,
    actorUserId: string,
    phoneId: string,
    agentId: string
  ): Promise<{ success: boolean }> {
    const localPhone = await this.resolveLocalPhone(organizationId, phoneId);
    const localAgent = await voiceAgentRepository.findById(agentId, organizationId);

    if (!localAgent) {
      throw new Error('Agent not found or does not belong to your organization.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    await provider.attachPhoneNumber(localPhone.provider_phone_id, localAgent.provider_agent_id);

    await phoneNumberRepository.updateAgentAssignment(localPhone.id, organizationId, localAgent.id);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'PHONE_NUMBER_ATTACHED',
      resource_type: 'phone_number',
      resource_id: localPhone.id,
      metadata: {
        phoneNumber: localPhone.phone_number,
        agentId: localAgent.id,
        agentName: localAgent.name,
      },
    });

    return { success: true };
  }

  async detachFromAgent(
    organizationId: string,
    actorUserId: string,
    phoneId: string
  ): Promise<{ success: boolean }> {
    const localPhone = await this.resolveLocalPhone(organizationId, phoneId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    await provider.detachPhoneNumber(localPhone.provider_phone_id);
    await phoneNumberRepository.updateAgentAssignment(localPhone.id, organizationId, null);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'PHONE_NUMBER_DETACHED',
      resource_type: 'phone_number',
      resource_id: localPhone.id,
      metadata: { phoneNumber: localPhone.phone_number },
    });

    return { success: true };
  }
}

export const phoneNumberService = new PhoneNumberService();
