import { callRepository, CallRecord, CallListFilters } from '@/lib/db/repositories/call.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { providerConnectionService } from '@/services/provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { rateLimitRepository } from '@/lib/db/repositories/rate-limit.repository';
import { generateUUID } from '@/lib/utils/crypto';
import {
  normalizeCallStatus,
  normalizeCallDuration,
  canTransitionCallStatus,
  formatDuration,
  InternalCallStatus,
  DurationSource,
  TERMINAL_CALL_STATUSES,
} from '@/lib/providers/voice/call-normalizer';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { entitlementService } from '@/services/entitlement.service';
import { usageService } from '@/services/usage.service';
import { logger } from '@/lib/utils/logger';

export interface DispatchCallParams {
  agentId: string;
  toNumber: string;
  fromNumberId?: string;
  callContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface NormalizedCallDTO {
  id: string;
  organizationId: string;
  provider: string;
  providerCallId: string | null;
  providerRequestId: string | null;
  agentId: string | null;
  agentName: string | null;
  phoneNumberId: string | null;
  phoneNumberDisplay: string | null;
  direction: 'inbound' | 'outbound';
  destinationNumber: string;
  sourceNumber: string | null;
  status: InternalCallStatus;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  durationDisplay: string;
  durationSource: DurationSource;
  recordingUrl: string | null;
  recordingAvailable: boolean;
  summary: string | null;
  sentiment: string | null;
  sentimentDetails: string | null;
  extractedVariables: Record<string, unknown>;
  transcript: string | null;
  callContext: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function mapCallRecordToDTO(record: CallRecord): NormalizedCallDTO {
  return {
    id: record.id,
    organizationId: record.organization_id,
    provider: record.provider,
    providerCallId: record.provider_call_id,
    providerRequestId: record.provider_request_id,
    agentId: record.agent_id,
    agentName: record.agent_name || null,
    phoneNumberId: record.phone_number_id,
    phoneNumberDisplay: record.phone_number_display || record.source_number || null,
    direction: record.direction,
    destinationNumber: record.destination_number,
    sourceNumber: record.source_number,
    status: record.status as InternalCallStatus,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    durationSeconds: record.duration_seconds,
    durationDisplay: formatDuration(record.duration_seconds),
    durationSource: record.duration_source as DurationSource,
    recordingUrl: record.recording_url,
    recordingAvailable: record.recording_available,
    summary: record.summary,
    sentiment: record.sentiment,
    sentimentDetails: record.sentiment_details,
    extractedVariables: record.extracted_variables || {},
    transcript: record.transcript,
    callContext: record.call_context || {},
    metadata: record.metadata || {},
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export class CallService {
  /**
   * Dispatch an outbound voice call through the active voice provider.
   * Enforces:
   * - Organization ownership of agent & phone number
   * - Strict E.164 phone normalization
   * - Idempotency replay without re-dispatching
   * - Abuse rate limiting
   * - Structured audit logging
   */
  async dispatchCall(
    organizationId: string,
    actorUserId: string,
    params: DispatchCallParams,
    ipAddress?: string
  ): Promise<NormalizedCallDTO> {
    // 1. Idempotency Check: if key provided and already processed, return original call immediately
    if (params.idempotencyKey) {
      const existing = await callRepository.findByIdempotencyKey(
        organizationId,
        params.idempotencyKey
      );
      if (existing) {
        logger.info('call.dispatch_idempotent_replay', {
          action: 'CALL_DISPATCH_REPLAY',
          metadata: { callId: existing.id, idempotencyKey: params.idempotencyKey },
        });
        return mapCallRecordToDTO(existing);
      }
    }

    // 2. Rate Limiting Check (15 dispatches per minute per organization/user)
    const rateLimitKey = `call_dispatch:${organizationId}:${actorUserId}`;
    const rateCheck = await rateLimitRepository.checkAndConsume(rateLimitKey, 15, 60);
    if (!rateCheck.allowed) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'CALL_DISPATCH_FAILED',
        resource_type: 'call',
        ip_address: ipAddress,
        metadata: { reason: 'RATE_LIMITED', resetAt: rateCheck.resetAt.toISOString() },
      });
      throw new VoiceProviderError(
        'PROVIDER_RATE_LIMITED',
        'Call dispatch rate limit exceeded. Please wait a moment before trying again.',
        429
      );
    }

    // 2.5 Entitlement & Balance Check (Phase 7): Ensure subscription is active and credits/minutes available
    await entitlementService.assertCanDispatchCall(organizationId);

    // 3. Resolve & validate agent ownership
    const localAgent = await voiceAgentRepository.findById(params.agentId, organizationId);
    if (!localAgent) {
      throw new Error('Voice agent not found or does not belong to your organization.');
    }
    const providerAgentId = localAgent.provider_agent_id;

    // 4. Resolve & validate phone number ownership if provided
    let localPhone = null;
    let providerPhoneId: string | undefined = undefined;
    let sourceNumber: string | null = null;

    if (params.fromNumberId) {
      localPhone = await phoneNumberRepository.findById(params.fromNumberId, organizationId);
      if (!localPhone) {
        throw new Error('Phone number not found or does not belong to your organization.');
      }
      providerPhoneId = localPhone.provider_phone_id;
      sourceNumber = localPhone.phone_number;
    }

    // 5. Audit dispatch request
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CALL_DISPATCH_REQUESTED',
      resource_type: 'call',
      ip_address: ipAddress,
      metadata: {
        agentId: params.agentId,
        destinationNumber: params.toNumber,
        fromNumberId: params.fromNumberId,
      },
    });

    // 6. Generate local UUID and correlation metadata
    const localCallId = generateUUID();
    const correlationMetadata: Record<string, unknown> = {
      voicenuvo_call_id: localCallId,
      organization_id: organizationId,
      ...(params.metadata || {}),
    };

    // 7. Dispatch call via VoiceProvider
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    let dispatchResult;
    try {
      dispatchResult = await provider.dispatchCall({
        agentId: providerAgentId,
        toNumber: params.toNumber,
        fromNumberId: providerPhoneId,
        callContext: params.callContext,
        metadata: correlationMetadata,
      });
    } catch (err) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'CALL_DISPATCH_FAILED',
        resource_type: 'call',
        resource_id: localCallId,
        ip_address: ipAddress,
        metadata: {
          error: (err as Error).message,
          agentId: params.agentId,
          destinationNumber: params.toNumber,
        },
      });
      throw err;
    }

    // 8. Normalize status and persist control plane record
    const normalizedStatus = normalizeCallStatus(dispatchResult.status);

    const record = await callRepository.create({
      id: localCallId,
      organizationId,
      provider: 'OMNIDIMENSION',
      providerCallId: dispatchResult.providerCallId || null,
      providerRequestId: dispatchResult.providerRequestId || null,
      agentId: localAgent.id,
      providerAgentId,
      phoneNumberId: localPhone?.id || null,
      providerPhoneNumberId: providerPhoneId || null,
      direction: 'outbound',
      destinationNumber: params.toNumber,
      sourceNumber,
      status: normalizedStatus,
      durationSeconds: 0,
      durationSource: 'UNKNOWN',
      callContext: params.callContext,
      metadata: params.metadata,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 9. Record success audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'CALL_DISPATCH_ACCEPTED',
      resource_type: 'call',
      resource_id: localCallId,
      ip_address: ipAddress,
      metadata: {
        providerCallId: dispatchResult.providerCallId,
        providerRequestId: dispatchResult.providerRequestId,
        status: normalizedStatus,
      },
    });

    return mapCallRecordToDTO({
      ...record,
      agent_name: localAgent.name,
      phone_number_display: sourceNumber || undefined,
    });
  }

  /**
   * List calls for an organization with pagination and filters
   */
  async listCalls(
    organizationId: string,
    filters: CallListFilters = {}
  ): Promise<{ calls: NormalizedCallDTO[]; total: number; page: number; limit: number; totalPages: number }> {
    const { calls, total } = await callRepository.list(organizationId, filters);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const totalPages = Math.ceil(total / limit);

    return {
      calls: calls.map(mapCallRecordToDTO),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieve a single call record with optional live provider sync
   */
  async getCall(
    organizationId: string,
    callId: string,
    actorUserId?: string,
    options?: { refresh?: boolean }
  ): Promise<NormalizedCallDTO> {
    const call = await callRepository.findById(callId, organizationId);
    if (!call) {
      throw new Error('Call not found or does not belong to your organization.');
    }

    // Optional live provider refresh if call has a provider call id
    if (options?.refresh && call.provider_call_id) {
      try {
        const provider = await providerConnectionService.getProviderForOrganization(organizationId);
        const providerLog = await provider.getCallLog(call.provider_call_id);

        if (providerLog) {
          const freshStatus = normalizeCallStatus(providerLog.status);
          const duration = normalizeCallDuration({
            seconds: providerLog.durationSeconds,
            displayDuration: providerLog.durationDisplay,
          });

          const updated = await callRepository.update(call.id, organizationId, {
            status: freshStatus,
            duration_seconds: duration.durationSeconds,
            duration_source: duration.durationSource,
            recording_url: providerLog.recordingUrl || call.recording_url,
            sentiment: providerLog.sentimentScore || call.sentiment,
            sentiment_details: providerLog.sentimentDetails || call.sentiment_details,
            summary: providerLog.summary || call.summary,
            transcript: providerLog.conversation || call.transcript,
            extracted_variables: {
              ...(call.extracted_variables || {}),
              ...(providerLog.extractedVariables || {}),
            },
            last_provider_sync_at: new Date().toISOString(),
          });

          if (freshStatus === 'COMPLETED' && duration.durationSeconds > 0) {
            usageService
              .recordCallUsage(organizationId, {
                provider: call.provider || 'OMNIDIMENSION',
                providerCallId: call.provider_call_id,
                callId: call.id,
                durationSeconds: duration.durationSeconds,
                usageType: 'VOICE_OUTBOUND',
                source: duration.durationSource || 'PROVIDER_COMPLETED',
              })
              .catch((err) => {
                logger.warn('call.sync_usage_failed', {
                  metadata: { callId: call.id },
                  errorMessage: (err as Error).message,
                });
              });
          }

          return mapCallRecordToDTO({
            ...updated,
            agent_name: call.agent_name,
            phone_number_display: call.phone_number_display,
          });
        }
      } catch (err) {
        logger.warn('call.provider_refresh_failed', {
          metadata: { callId: call.id },
          errorMessage: (err as Error).message,
        });
      }
    }

    if (actorUserId) {
      await auditRepository.record({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'CALL_VIEWED',
        resource_type: 'call',
        resource_id: call.id,
      });
    }

    return mapCallRecordToDTO(call);
  }

  /**
   * Process post-call webhook delivery from OmniDimension.
   * Handles:
   * - Correlation via metadata.voicenuvo_call_id, provider_call_id, or requestId
   * - Terminal state transition protection
   * - Authoritative duration extraction
   * - Idempotency
   */
  async processWebhook(
    payload: Record<string, unknown>
  ): Promise<{ matched: boolean; callId?: string; status?: string; reason?: string }> {
    // 1. Extract correlation identifiers
    const metadata = (payload.metadata as Record<string, unknown>) || {};
    const localCallId = (metadata.voicenuvo_call_id || metadata.call_id) as string | undefined;
    const organizationId = metadata.organization_id as string | undefined;

    const providerCallId = (payload.id ?? payload.call_id ?? payload.provider_call_id) !== undefined
      ? String(payload.id ?? payload.call_id ?? payload.provider_call_id)
      : undefined;

    let requestIdStr: string | undefined;
    if (payload.requestId) {
      requestIdStr = String(payload.requestId);
    } else if (payload.call_request_id) {
      if (typeof payload.call_request_id === 'object' && payload.call_request_id !== null && 'id' in payload.call_request_id) {
        requestIdStr = String((payload.call_request_id as { id?: unknown }).id);
      } else {
        requestIdStr = String(payload.call_request_id);
      }
    }

    // 2. Correlate local call record
    let call: CallRecord | null = null;
    if (localCallId) {
      call = await callRepository.findById(localCallId, organizationId);
    }
    if (!call && providerCallId) {
      call = await callRepository.findByProviderCallId(providerCallId, organizationId);
    }
    if (!call && requestIdStr) {
      call = await callRepository.findByProviderRequestId(requestIdStr, organizationId);
    }

    if (!call) {
      logger.warn('call.webhook_unmatched', {
        metadata: {
          providerCallId,
          requestId: requestIdStr,
          localCallId,
        },
      });
      return { matched: false, reason: 'No matching call record found for webhook payload' };
    }

    // 3. Extract and normalize incoming status
    const rawStatus = (payload.call_status ?? payload.status) as string | undefined;
    const incomingStatus = normalizeCallStatus(rawStatus);

    // 4. State transition protection: Terminal states cannot be downgraded
    const currentStatus = call.status as InternalCallStatus;
    const finalStatus = canTransitionCallStatus(currentStatus, incomingStatus)
      ? incomingStatus
      : currentStatus;

    // 5. Duration calculation
    const rawSeconds =
      typeof payload.duration === 'number'
        ? payload.duration
        : (payload.call_duration_in_seconds ?? payload.duration_seconds);
    const rawDisplay =
      typeof payload.duration === 'string'
        ? payload.duration
        : (payload.call_duration as string | undefined);

    const duration = normalizeCallDuration({
      seconds: rawSeconds as number | string | null | undefined,
      displayDuration: rawDisplay,
      startedAt: (payload.time_of_call ?? payload.started_at) as string,
      endedAt: payload.ended_at as string,
    });

    // 6. Recording & metadata extraction
    const rawRecUrl = payload.recording_url;
    const recordingUrl = typeof rawRecUrl === 'string' && rawRecUrl.startsWith('http')
      ? rawRecUrl
      : call.recording_url;

    const summary = (payload.summary as string) || call.summary;
    const sentiment = (payload.sentiment_score ?? payload.sentiment) as string | undefined;
    const sentimentDetails = (payload.sentiment_analysis_details ?? payload.sentiment_details ?? payload.sentiment_analysis) as string | undefined;
    const transcript = (payload.call_conversation ?? payload.conversation ?? payload.transcript) as string | undefined;

    const extractedVars = {
      ...(call.extracted_variables || {}),
      ...((payload.extracted_variables as Record<string, unknown>) || {}),
    };

    // Stale event guard: do not reduce duration if a terminal state is already recorded
    const isStaleEvent = TERMINAL_CALL_STATUSES.has(currentStatus) && !TERMINAL_CALL_STATUSES.has(incomingStatus);
    const finalDurationSeconds = isStaleEvent
      ? call.duration_seconds
      : (duration.durationSeconds > 0 ? duration.durationSeconds : call.duration_seconds);
    const finalDurationSource = isStaleEvent
      ? call.duration_source
      : (duration.durationSource !== 'UNKNOWN' ? duration.durationSource : call.duration_source);

    // 7. Update call record in database
    const updated = await callRepository.update(call.id, call.organization_id, {
      provider_call_id: providerCallId || call.provider_call_id,
      status: finalStatus,
      duration_seconds: finalDurationSeconds,
      duration_source: finalDurationSource,
      recording_url: recordingUrl,
      summary: summary || call.summary,
      sentiment: sentiment || call.sentiment,
      sentiment_details: sentimentDetails || call.sentiment_details,
      transcript: transcript || call.transcript,
      extracted_variables: extractedVars,
      last_provider_sync_at: new Date().toISOString(),
    });

    if (finalStatus === 'COMPLETED' && updated.duration_seconds > 0) {
      usageService
        .recordCallUsage(call.organization_id, {
          provider: call.provider || 'OMNIDIMENSION',
          providerCallId: providerCallId || call.provider_call_id,
          callId: call.id,
          durationSeconds: updated.duration_seconds,
          usageType: 'VOICE_OUTBOUND',
          source: updated.duration_source || 'PROVIDER_COMPLETED',
        })
        .catch((err) => {
          logger.warn('call.webhook_usage_failed', {
            metadata: { callId: call.id },
            errorMessage: (err as Error).message,
          });
        });
    }

    // 8. Record audit log
    await auditRepository.record({
      organization_id: call.organization_id,
      action: 'CALL_WEBHOOK_RECEIVED',
      resource_type: 'call',
      resource_id: call.id,
      metadata: {
        providerCallId,
        incomingStatus,
        finalStatus,
        durationSeconds: updated.duration_seconds,
      },
    });

    if (currentStatus !== finalStatus) {
      await auditRepository.record({
        organization_id: call.organization_id,
        action: 'CALL_STATUS_UPDATED',
        resource_type: 'call',
        resource_id: call.id,
        metadata: {
          previousStatus: currentStatus,
          newStatus: finalStatus,
        },
      });
    }

    return {
      matched: true,
      callId: call.id,
      status: finalStatus,
    };
  }
}

export const callService = new CallService();
