import {
  campaignRepository,
  CampaignRecord,
  CreateCampaignRecordInput,
  UpdateCampaignRecordInput,
} from '@/lib/db/repositories/campaign.repository';
import {
  campaignContactRepository,
  CampaignContactRecord,
  CreateCampaignContactInput,
} from '@/lib/db/repositories/campaign-contact.repository';
import {
  campaignNumberPoolRepository,
  CampaignNumberPoolRecord,
} from '@/lib/db/repositories/campaign-number-pool.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { providerConnectionService } from '@/services/provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import {
  CreateCampaignSchema,
  SetConcurrencySchema,
  SetDailyTimeControlSchema,
  RetryCampaignSchema,
  AddContactsSchema,
  CreateCampaignInput,
  SetConcurrencyInput,
  SetDailyTimeControlInput,
  RetryCampaignInput,
  AddContactsInput,
} from '@/lib/validation/campaign.schema';
import { logger } from '@/lib/utils/logger';
import { entitlementService } from '@/services/entitlement.service';

export interface CampaignListFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CampaignContactFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CampaignService {
  /**
   * Create a new bulk call campaign (saved as DRAFT initially).
   */
  async createCampaign(
    organizationId: string,
    actorUserId: string,
    rawInput: unknown,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    // Entitlement limit check (Phase 7)
    await entitlementService.assertCanCreateCampaign(organizationId);

    const input: CreateCampaignInput = CreateCampaignSchema.parse(rawInput);

    // 1. Verify Agent Ownership
    const localAgent = await voiceAgentRepository.findById(input.agentId, organizationId);
    if (!localAgent) {
      throw new Error('Voice agent not found or does not belong to your organization.');
    }
    const providerAgentId = localAgent.provider_agent_id;

    // 2. Verify Caller Phone Number Ownership (if provided)
    let providerPhoneId = '';
    let localPhone = null;
    if (input.phoneNumberId) {
      localPhone = await phoneNumberRepository.findById(input.phoneNumberId, organizationId);
      if (!localPhone) {
        throw new Error('Caller phone number not found or does not belong to your organization.');
      }
      providerPhoneId = localPhone.provider_phone_id;
    }

    // 3. Verify Number Pool ownership if provided
    const poolPhoneRecords = [];
    if (input.rotationPoolNumberIds && input.rotationPoolNumberIds.length > 0) {
      for (const phoneId of input.rotationPoolNumberIds) {
        const p = await phoneNumberRepository.findById(phoneId, organizationId);
        if (!p) {
          throw new Error(`Rotation number ${phoneId} not found or does not belong to your organization.`);
        }
        poolPhoneRecords.push(p);
      }
    }

    // 4. Resolve Active Provider
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.bulkCampaigns) {
      throw new VoiceProviderError(
        'PROVIDER_UNAVAILABLE',
        'The active voice provider does not support bulk call campaigns.',
        400
      );
    }

    // 5. Create Local Campaign in DRAFT state
    const createDbInput: CreateCampaignRecordInput = {
      organizationId,
      provider: 'OMNIDIMENSION',
      providerCampaignId: null,
      name: input.name,
      description: input.description,
      agentId: localAgent.id,
      providerAgentId: providerAgentId,
      phoneNumberId: localPhone?.id || '',
      providerPhoneNumberId: providerPhoneId,
      status: 'DRAFT',
      timezone: input.timezone || 'Asia/Kolkata',
      concurrency: input.concurrency || 1,
      retryPolicy: input.retryPolicy,
      callingWindow: input.callingWindow,
      rotationConfig: {
        strategy: input.rotationStrategy || 'fixed_count',
        callsPerNumber: input.callsPerNumber || 50,
      },
      createdBy: actorUserId,
    };

    const campaign = await campaignRepository.create(createDbInput);

    // 6. Attempt Provider Campaign Creation (as draft)
    let providerCampaignId: string | null = null;
    try {
      const rotationNumbers = poolPhoneRecords.map((p, idx) => ({
        phone_number_id: Number(p.provider_phone_id) || idx + 1,
        sequence: idx + 1,
      }));

      const providerResult = await provider.createCampaign({
        name: input.name,
        botId: Number(providerAgentId) || undefined,
        phoneNumberId: providerPhoneId,
        saveAsDraft: true,
        concurrentCallLimit: input.concurrency,
        timezone: input.timezone,
        rotation: rotationNumbers.length > 0
          ? {
              numbers: rotationNumbers,
              strategy: input.rotationStrategy as 'fixed_count' | 'cpr_threshold' | 'both' | 'none',
              calls_per_number: input.callsPerNumber,
            }
          : undefined,
        retryConfig: input.retryPolicy
          ? {
              auto_retry: input.retryPolicy.autoRetry,
              retry_limit: input.retryPolicy.retryLimit,
              auto_retry_schedule: input.retryPolicy.autoRetrySchedule,
              retry_schedule_days: input.retryPolicy.retryScheduleDays,
              retry_schedule_hours: input.retryPolicy.retryScheduleHours,
            }
          : undefined,
      });

      providerCampaignId = providerResult.providerCampaignId;

      await campaignRepository.update(campaign.id, organizationId, {
        providerCampaignId,
      });
      campaign.provider_campaign_id = providerCampaignId;
    } catch (err) {
      logger.warn('CAMPAIGN_CREATE_PROVIDER_DEFERRED', {
        errorMessage: (err as Error).message,
      });
    }

    // 7. Add rotation pool numbers if provided
    if (poolPhoneRecords.length > 0) {
      for (const p of poolPhoneRecords) {
        await campaignNumberPoolRepository.addNumber({
          organizationId,
          campaignId: campaign.id,
          phoneNumberId: p.id,
          providerNumberId: p.provider_phone_id,
          phoneNumber: p.phone_number,
          isActive: true,
        });

        if (providerCampaignId && capabilities.campaignNumberRotation) {
          try {
            await provider.addCampaignNumber(providerCampaignId, p.provider_phone_id);
          } catch (numErr) {
            logger.warn('CAMPAIGN_ADD_ROTATION_NUMBER_FAILED', {
              errorMessage: (numErr as Error).message,
            });
          }
        }
      }
    }

    // 8. Audit Log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_CREATED',
      resource_type: 'campaign',
      resource_id: campaign.id,
      ip_address: ipAddress,
      metadata: {
        campaignId: campaign.id,
        name: campaign.name,
        agentId: campaign.agent_id,
        phoneNumberId: campaign.phone_number_id,
        providerCampaignId,
      },
    });

    return campaign;
  }

  /**
   * Get single campaign by ID
   */
  async getCampaign(organizationId: string, campaignId: string): Promise<CampaignRecord> {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }
    return campaign;
  }

  /**
   * List campaigns for organization
   */
  async listCampaigns(
    organizationId: string,
    filters: CampaignListFilters
  ): Promise<{ campaigns: CampaignRecord[]; total: number }> {
    const [campaigns, total] = await Promise.all([
      campaignRepository.listByOrganizationId(organizationId, filters),
      campaignRepository.countByOrganizationId(organizationId, filters),
    ]);
    return { campaigns, total };
  }

  /**
   * Update campaign details (name, description, etc.)
   */
  async updateCampaign(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    updates: UpdateCampaignRecordInput,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const existing = await campaignRepository.findById(campaignId, organizationId);
    if (!existing) {
      throw new Error('Campaign not found.');
    }

    const updated = await campaignRepository.update(campaignId, organizationId, updates);
    if (!updated) {
      throw new Error('Failed to update campaign.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_UPDATED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  /**
   * Import contacts into a campaign (manual or CSV)
   * Validates each contact (E.164 phone, custom vars limit, metadata limit).
   * Chunks contacts into batches of up to 1,000 for provider delivery.
   */
  async addContacts(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    rawInput: unknown,
    ipAddress?: string
  ): Promise<{
    acceptedCount: number;
    rejectedCount: number;
    rejectedRows: Array<{ row: number; error: string; data?: unknown }>;
    totalCampaignContacts: number;
  }> {
    const input: AddContactsInput = AddContactsSchema.parse(rawInput);
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELED') {
      throw new Error(`Cannot add contacts to a campaign with status ${campaign.status}.`);
    }

    const acceptedRows: CreateCampaignContactInput[] = [];
    const rejectedRows: Array<{ row: number; error: string; data?: unknown }> = [];

    // Row-level normalization & validation
    input.contacts.forEach((c, index: number) => {
      const rowNum = index + 1;
      try {
        const normalized = normalizePhoneNumber(c.phoneNumber);
        acceptedRows.push({
          organizationId,
          campaignId,
          phoneNumber: c.phoneNumber,
          normalizedPhoneNumber: normalized,
          customVariables: c.customVariables || {},
          metadata: c.metadata || {},
          status: 'PENDING',
        });
      } catch (err) {
        rejectedRows.push({
          row: rowNum,
          error: (err as Error).message || 'Invalid international phone number',
          data: c,
        });
      }
    });

    if (acceptedRows.length === 0) {
      return {
        acceptedCount: 0,
        rejectedCount: rejectedRows.length,
        rejectedRows,
        totalCampaignContacts: campaign.total_contacts,
      };
    }

    // 1. Chunked persistence into local DB
    await campaignContactRepository.bulkCreate(acceptedRows);

    // 2. Push batches to provider if provider campaign exists (up to 1,000 contacts per batch)
    if (campaign.provider_campaign_id) {
      try {
        const provider = await providerConnectionService.getProviderForOrganization(organizationId);
        const PROVIDER_CHUNK_SIZE = 1000;
        for (let i = 0; i < acceptedRows.length; i += PROVIDER_CHUNK_SIZE) {
          const providerChunk = acceptedRows.slice(i, i + PROVIDER_CHUNK_SIZE);
          const addRes = await provider.addCampaignContacts({
            campaignId: campaign.provider_campaign_id,
            contacts: providerChunk.map((item) => ({
              toNumber: item.normalizedPhoneNumber,
              customVariables: item.customVariables,
              metadata: {
                ...item.metadata,
                voicenuvo_campaign_id: campaignId,
              },
            })),
          });

          if (addRes?.added && addRes.added.length > 0) {
            for (const item of addRes.added) {
              if (item.lineId && item.toNumber) {
                const matches = await campaignContactRepository.findByCampaignId(campaignId, organizationId, {
                  search: item.toNumber,
                });
                if (matches.length > 0) {
                  await campaignContactRepository.updateStatus(matches[0].id, organizationId, {
                    providerLineId: String(item.lineId),
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        logger.warn('CAMPAIGN_PUSH_CONTACTS_PROVIDER_FAILED', {
          errorMessage: (err as Error).message,
        });
      }
    }

    // 3. Update campaign total contacts counter
    const newTotal = campaign.total_contacts + acceptedRows.length;
    await campaignRepository.updateCounters(campaignId, organizationId, {
      total: newTotal,
    });

    // 4. Audit Log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_CONTACTS_IMPORTED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: {
        campaignId,
        acceptedCount: acceptedRows.length,
        rejectedCount: rejectedRows.length,
      },
    });

    return {
      acceptedCount: acceptedRows.length,
      rejectedCount: rejectedRows.length,
      rejectedRows,
      totalCampaignContacts: newTotal,
    };
  }

  /**
   * Start a campaign.
   */
  async startCampaign(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (campaign.status === 'IN_PROGRESS') {
      return campaign;
    }

    if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
      throw new Error(`Cannot start campaign in status ${campaign.status}.`);
    }

    if (campaign.total_contacts === 0) {
      throw new Error('Cannot start a campaign with 0 contacts. Please import contacts first.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    let providerCampaignId = campaign.provider_campaign_id;
    if (!providerCampaignId) {
      const localAgent = await voiceAgentRepository.findById(campaign.agent_id, organizationId);
      if (!localAgent) throw new Error('Agent not found.');

      let providerPhoneId: string | undefined = undefined;
      if (campaign.phone_number_id) {
        const localPhone = await phoneNumberRepository.findById(campaign.phone_number_id, organizationId);
        providerPhoneId = localPhone?.provider_phone_id;
      }

      const pCamp = await provider.createCampaign({
        name: campaign.name,
        botId: Number(localAgent.provider_agent_id) || undefined,
        phoneNumberId: providerPhoneId || '',
        concurrentCallLimit: campaign.concurrency,
        timezone: campaign.timezone,
        saveAsDraft: false,
      });
      providerCampaignId = pCamp.providerCampaignId;

      await campaignRepository.update(campaignId, organizationId, {
        providerCampaignId,
      });
    }

    await provider.startCampaign(providerCampaignId);

    const startedAt = new Date().toISOString();
    const updated = await campaignRepository.update(campaignId, organizationId, {
      status: 'IN_PROGRESS',
      startedAt,
      pausedAt: null,
    });

    if (!updated) {
      throw new Error('Failed to update campaign state to IN_PROGRESS.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_STARTED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: {
        campaignId,
        providerCampaignId,
        totalContacts: campaign.total_contacts,
      },
    });

    return updated;
  }

  /**
   * Pause an in-progress campaign.
   */
  async pauseCampaign(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (campaign.status === 'PAUSED') {
      return campaign;
    }

    if (campaign.status !== 'IN_PROGRESS') {
      throw new Error(`Cannot pause campaign in status ${campaign.status}.`);
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignPauseResume) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support pause/resume.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.pauseCampaign(campaign.provider_campaign_id);
    }

    const pausedAt = new Date().toISOString();
    const updated = await campaignRepository.update(campaignId, organizationId, {
      status: 'PAUSED',
      pausedAt,
    });

    if (!updated) {
      throw new Error('Failed to update campaign state to PAUSED.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_PAUSED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId },
    });

    return updated;
  }

  /**
   * Resume a paused campaign.
   */
  async resumeCampaign(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (campaign.status === 'IN_PROGRESS') {
      return campaign;
    }

    if (campaign.status !== 'PAUSED') {
      throw new Error(`Cannot resume campaign in status ${campaign.status}.`);
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignPauseResume) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support pause/resume.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.resumeCampaign(campaign.provider_campaign_id);
    }

    const updated = await campaignRepository.update(campaignId, organizationId, {
      status: 'IN_PROGRESS',
      pausedAt: null,
    });

    if (!updated) {
      throw new Error('Failed to update campaign state to IN_PROGRESS.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_RESUMED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId },
    });

    return updated;
  }

  /**
   * Cancel a campaign.
   */
  async cancelCampaign(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (campaign.status === 'CANCELED') {
      return campaign;
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignPauseResume) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support campaign cancellation.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.cancelCampaign(campaign.provider_campaign_id);
    }

    const completedAt = new Date().toISOString();
    const updated = await campaignRepository.update(campaignId, organizationId, {
      status: 'CANCELED',
      completedAt,
    });

    if (!updated) {
      throw new Error('Failed to update campaign state to CANCELED.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_CANCELED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId },
    });

    return updated;
  }

  /**
   * Adjust campaign concurrency (concurrent call limit).
   */
  async setConcurrency(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    rawInput: unknown,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const input: SetConcurrencyInput = SetConcurrencySchema.parse(rawInput);
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignConcurrency) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support dynamic concurrency.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.setCampaignConcurrency(campaign.provider_campaign_id, {
        concurrentCallLimit: input.concurrency,
      });
    }

    const updated = await campaignRepository.update(campaignId, organizationId, {
      concurrency: input.concurrency,
    });

    if (!updated) {
      throw new Error('Failed to update campaign concurrency.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_CONCURRENCY_CHANGED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId, concurrency: input.concurrency },
    });

    return updated;
  }

  /**
   * Configure campaign daily calling window.
   */
  async setCallingWindow(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    rawInput: unknown,
    ipAddress?: string
  ): Promise<CampaignRecord> {
    const input: SetDailyTimeControlInput = SetDailyTimeControlSchema.parse(rawInput);
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignCallingWindows) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support calling window controls.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.setCampaignDailyTimeControl(campaign.provider_campaign_id, {
        enableDailyHardStop: input.enableDailyHardStop,
        dailyStopTime: input.dailyStopTime,
        dailyStopTimezone: input.dailyStopTimezone,
        enableDailyAutoStart: input.enableDailyAutoStart,
        dailyStartTime: input.dailyStartTime,
        dailyStartTimezone: input.dailyStartTimezone,
      });
    }

    const updated = await campaignRepository.update(campaignId, organizationId, {
      callingWindow: input,
    });

    if (!updated) {
      throw new Error('Failed to update calling window.');
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_CALLING_WINDOW_CHANGED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId, callingWindow: input as unknown as Record<string, unknown> },
    });

    return updated;
  }

  /**
   * Retry failed or unconnected contacts.
   */
  async retryContacts(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    rawInput: unknown,
    ipAddress?: string
  ): Promise<{ message: string; retriedReasons: string[]; maxRetries?: number }> {
    const input: RetryCampaignInput = RetryCampaignSchema.parse(rawInput);
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();
    if (!capabilities.campaignRetry) {
      throw new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Provider does not support campaign retries.', 400);
    }

    if (campaign.provider_campaign_id) {
      await provider.retryCampaign(campaign.provider_campaign_id, {
        retryStrategy: input.retryStrategy,
        failureReasons: input.failureReasons,
        maxRetries: input.maxRetries,
      });
    }

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_RETRY_REQUESTED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId, failureReasons: input.failureReasons, maxRetries: input.maxRetries },
    });

    return {
      message: 'Retry request successfully submitted.',
      retriedReasons: input.failureReasons || [],
      maxRetries: input.maxRetries,
    };
  }

  /**
   * Get live status from provider (probes provider live status endpoint)
   */
  async getLiveStatus(organizationId: string, campaignId: string) {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (!campaign.provider_campaign_id) {
      return {
        campaignId,
        status: campaign.status,
        totalContacts: campaign.total_contacts,
        queued: 0,
        inProgress: 0,
        completed: campaign.completed_contacts,
        failed: campaign.failed_contacts,
        busy: 0,
        noAnswer: 0,
      };
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.getCampaignLiveStatus(campaign.provider_campaign_id);
  }

  /**
   * Sync campaign results from provider and paginate through lines using cursor.
   * Maps provider lines back to local campaign contacts.
   */
  async syncResults(
    organizationId: string,
    campaignId: string,
    options?: { cursor?: string; pageSize?: number }
  ) {
    const campaign = await campaignRepository.findById(campaignId, organizationId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    if (!campaign.provider_campaign_id) {
      const localContacts = await campaignContactRepository.findByCampaignId(campaignId, organizationId, {
        limit: options?.pageSize || 50,
      });
      const total = await campaignContactRepository.countByCampaignId(campaignId, organizationId);
      return {
        lines: localContacts,
        nextCursor: null,
        total,
      };
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const providerLinesResult = await provider.listCampaignLines(campaign.provider_campaign_id, {
      cursor: options?.cursor,
      pageSize: options?.pageSize || 50,
    });

    // Reconcile lines with local DB
    for (const line of providerLinesResult.records) {
      const updated = await campaignContactRepository.updateByProviderLineId(campaignId, String(line.id), {
        status: line.callStatus,
        failureReason: line.failureReason,
        durationSeconds: line.duration || 0,
        attemptCount: line.retryAttempt || 1,
        providerCallId: line.callId ? String(line.callId) : null,
      });

      if (!updated && line.toNumber) {
        const matches = await campaignContactRepository.findByCampaignId(campaignId, organizationId, {
          search: line.toNumber,
        });
        if (matches.length > 0) {
          await campaignContactRepository.updateStatus(matches[0].id, organizationId, {
            status: line.callStatus,
            providerLineId: String(line.id),
            failureReason: line.failureReason,
            durationSeconds: line.duration || 0,
            attemptCount: line.retryAttempt || 1,
            providerCallId: line.callId ? String(line.callId) : null,
          });
        }
      }
    }

    // Refresh counters
    const stats = await campaignContactRepository.getStats(campaignId, organizationId);
    await campaignRepository.updateCounters(campaignId, organizationId, {
      completed: stats.completed,
      failed: stats.failed + stats.busy + stats.noAnswer,
    });

    return {
      lines: providerLinesResult.records,
      nextCursor: providerLinesResult.nextCursor,
      total: providerLinesResult.totalRecords,
    };
  }

  /**
   * List campaign contacts locally (with filters, search, and pagination)
   */
  async listContacts(
    organizationId: string,
    campaignId: string,
    filters: CampaignContactFilters
  ) {
    await this.getCampaign(organizationId, campaignId);
    const [contacts, total] = await Promise.all([
      campaignContactRepository.findByCampaignId(campaignId, organizationId, filters),
      campaignContactRepository.countByCampaignId(campaignId, organizationId, filters),
    ]);
    return { contacts, total };
  }

  /**
   * List number rotation pool for a campaign
   */
  async getNumberPool(organizationId: string, campaignId: string): Promise<CampaignNumberPoolRecord[]> {
    await this.getCampaign(organizationId, campaignId);
    return campaignNumberPoolRepository.findByCampaignId(campaignId, organizationId);
  }

  /**
   * Add a phone number to rotation pool
   */
  async addNumberToPool(
    organizationId: string,
    campaignId: string,
    actorUserId: string,
    phoneNumberId: string,
    ipAddress?: string
  ): Promise<CampaignNumberPoolRecord> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    // Verify phone ownership
    const phone = await phoneNumberRepository.findById(phoneNumberId, organizationId);
    if (!phone) {
      throw new Error('Phone number not found or does not belong to your organization.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const capabilities = await provider.getCapabilities();

    if (campaign.provider_campaign_id && capabilities.campaignNumberRotation) {
      await provider.addCampaignNumber(campaign.provider_campaign_id, phone.provider_phone_id);
    }

    const poolItem = await campaignNumberPoolRepository.addNumber({
      organizationId,
      campaignId,
      phoneNumberId: phone.id,
      providerNumberId: phone.provider_phone_id,
      phoneNumber: phone.phone_number,
      isActive: true,
    });

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CAMPAIGN_NUMBER_ADDED',
      resource_type: 'campaign',
      resource_id: campaignId,
      ip_address: ipAddress,
      metadata: { campaignId, phoneNumberId, providerPhoneNumberId: phone.provider_phone_id },
    });

    return poolItem;
  }

  /**
   * Toggle a pool number active/inactive
   */
  async setNumberActive(
    organizationId: string,
    campaignId: string,
    phoneNumberId: string,
    isActive: boolean
  ): Promise<boolean> {
    await this.getCampaign(organizationId, campaignId);
    const success = await campaignNumberPoolRepository.setNumberActive(campaignId, organizationId, phoneNumberId, isActive);
    return success;
  }

  /**
   * Export all contacts of a campaign as a CSV string
   */
  async exportContactsCsv(organizationId: string, campaignId: string): Promise<string> {
    await this.getCampaign(organizationId, campaignId);
    const contacts = await campaignContactRepository.listAllForExport(campaignId, organizationId);

    // Build CSV headers and rows safely
    const headers = ['id', 'phone_number', 'status', 'attempts', 'failure_reason', 'duration_seconds', 'created_at', 'completed_at'];
    const rows = contacts.map((c: CampaignContactRecord) => [
      c.id,
      c.normalized_phone_number || c.phone_number,
      c.status,
      c.attempt_count.toString(),
      c.failure_reason ? `"${c.failure_reason.replace(/"/g, '""')}"` : '',
      c.duration_seconds.toString(),
      c.created_at,
      c.completed_at || '',
    ]);

    return [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
  }
}

export const campaignService = new CampaignService();
