import type {
  NormalizedAgent,
  NormalizedAgentVersion,
  NormalizedKnowledgeFile,
  NormalizedPhoneNumber,
  CatalogProvider,
  CatalogVoice,
  ProviderCallLog,
} from '../provider-types';

export function mapSdkAgentToNormalized(agent: Record<string, unknown>): NormalizedAgent {
  const a = agent as {
    id?: string | number;
    name?: string;
    status?: string;
    is_active?: boolean;
    welcome_message?: string;
    voice_external_id?: string;
    voice_id?: string | number;
    voice_name?: string;
    voice_provider?: string;
    llm_service?: string;
    languages?: Array<{ label?: string; value?: number }>;
    speech_speed?: number;
    enable_web_search?: boolean;
    voicemail_enabled?: boolean;
    voicemail_message?: string;
    is_end_call_enabled?: boolean;
    end_call_message?: string;
    max_call_duration_in_sec?: number;
    attach_file_ids?: (string | number)[];
    created_at?: string;
    updated_at?: string;
  };

  return {
    id: String(a.id ?? ''),
    name: a.name || 'Unnamed Agent',
    status: a.status || (a.is_active ? 'ACTIVE' : 'READY'),
    welcomeMessage: a.welcome_message || '',
    voiceId: a.voice_external_id || (a.voice_id ? String(a.voice_id) : undefined),
    voiceName: a.voice_name || '',
    voiceProvider: a.voice_provider || 'elevenlabs',
    model: a.llm_service || 'gpt-4o-mini',
    language: a.languages && a.languages.length > 0 ? (a.languages[0].label || 'English') : 'English',
    speechSpeed: a.speech_speed ?? 1.0,
    enableWebSearch: Boolean(a.enable_web_search),
    voicemailEnabled: Boolean(a.voicemail_enabled),
    voicemailMessage: a.voicemail_message || '',
    isEndCallEnabled: Boolean(a.is_end_call_enabled),
    endCallMessage: a.end_call_message || '',
    maxDurationSec: a.max_call_duration_in_sec ?? 600,
    attachedFileIds: (a.attach_file_ids || []).map((x) => Number(x)),
    createdAt: a.created_at || new Date().toISOString(),
    updatedAt: a.updated_at || new Date().toISOString(),
  };
}

export function mapSdkAgentVersionToNormalized(version: Record<string, unknown>): NormalizedAgentVersion {
  const v = version as {
    version_number?: number | string;
    name?: string;
    created_at?: string;
    version_type?: string;
  };
  return {
    versionNumber: Number(v.version_number ?? 1),
    name: v.name || `Version ${v.version_number ?? 1}`,
    createdAt: v.created_at || new Date().toISOString(),
    type: (v.version_type as 'manual' | 'auto' | 'system') || 'manual',
  };
}

export function mapSdkFileToNormalized(file: Record<string, unknown>): NormalizedKnowledgeFile {
  const f = file as {
    id?: string | number;
    file_name?: string;
    name?: string;
    filename?: string;
    status?: string;
    mime_type?: string;
    content_type?: string;
    file_size?: number | string;
    created_at?: string;
  };
  return {
    id: String(f.id ?? ''),
    filename: f.file_name || f.name || f.filename || 'Untitled Document',
    status: f.status || 'READY',
    mimeType: f.mime_type || f.content_type || 'application/pdf',
    fileSizeBytes: f.file_size ? Number(f.file_size) : undefined,
    createdAt: f.created_at || new Date().toISOString(),
  };
}

export function mapSdkPhoneToNormalized(phone: Record<string, unknown>): NormalizedPhoneNumber {
  const p = phone as {
    id?: string | number;
    phone_number?: string;
    region?: string;
    carrier?: string;
    carrier_label?: string;
    status?: string;
    assigned_bot_id?: string | number;
    agent_id?: string | number;
    monthly_rental_usd?: number | string;
    kyc_required?: boolean;
  };
  return {
    id: String(p.id ?? ''),
    phoneNumber: p.phone_number || '',
    region: p.region || 'US',
    carrier: p.carrier || p.carrier_label || 'Default',
    status: p.status || 'ACTIVE',
    assignedAgentId: p.assigned_bot_id || p.agent_id ? String(p.assigned_bot_id || p.agent_id) : undefined,
    monthlyRentalUsd: p.monthly_rental_usd ? Number(p.monthly_rental_usd) : undefined,
    kycRequired: Boolean(p.kyc_required),
  };
}

export function mapSdkVoiceToCatalog(voice: Record<string, unknown>): CatalogVoice {
  const v = voice as {
    id?: string | number;
    voice_id?: string | number;
    name?: string;
    voice_name?: string;
    display_name?: string;
    provider?: string;
    service?: string;
    gender?: string;
    language?: string;
    accent?: string;
    sample_url?: string;
    preview_audio_url?: string;
  };
  return {
    id: String(v.id ?? v.voice_id ?? ''),
    name: v.name || v.voice_name || '',
    displayName: v.display_name || v.name || 'Voice',
    provider: v.provider || v.service || 'elevenlabs',
    gender: v.gender,
    language: v.language,
    accent: v.accent,
    sampleUrl: v.sample_url || v.preview_audio_url,
  };
}

export function mapSdkProviderToCatalog(
  provider: Record<string, unknown>,
  category: 'LLM' | 'STT' | 'TTS'
): CatalogProvider {
  const p = provider as {
    id?: string | number;
    name?: string;
    display_name?: string;
    models?: string[];
  };
  return {
    id: String(p.id || p.name || ''),
    name: p.display_name || p.name || '',
    category,
    models: p.models || [],
  };
}

export function mapSdkCallToNormalized(call: Record<string, unknown>): ProviderCallLog {
  const c = call as {
    id?: number | string;
    bot_name?: string;
    time_of_call?: string;
    from_number?: string;
    to_number?: string;
    call_direction?: 'inbound' | 'outbound';
    call_status?: string;
    call_duration?: string;
    call_duration_in_seconds?: number;
    recording_url?: string | boolean;
    internal_recording_url?: string | boolean;
    sentiment_score?: string;
    sentiment_analysis_details?: string;
    call_conversation?: string;
    extracted_variables?: Record<string, unknown>;
    aggregated_estimated_cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    call_request_id?: unknown;
    model_name?: string;
  };

  const durationSec = typeof c.call_duration_in_seconds === 'number'
    ? Math.round(c.call_duration_in_seconds)
    : 0;

  const validRecordingUrl = typeof c.recording_url === 'string' && c.recording_url.startsWith('http')
    ? c.recording_url
    : null;

  const validInternalRecordingUrl = typeof c.internal_recording_url === 'string' && c.internal_recording_url.startsWith('http')
    ? c.internal_recording_url
    : null;

  let requestIdStr: string | undefined;
  if (c.call_request_id) {
    if (typeof c.call_request_id === 'object' && c.call_request_id !== null && 'id' in c.call_request_id) {
      requestIdStr = String((c.call_request_id as { id?: unknown }).id);
    } else {
      requestIdStr = String(c.call_request_id);
    }
  }

  return {
    id: String(c.id ?? ''),
    agentName: c.bot_name,
    timeOfCall: c.time_of_call,
    fromNumber: c.from_number,
    toNumber: c.to_number,
    direction: c.call_direction || 'outbound',
    status: c.call_status || 'completed',
    durationSeconds: durationSec,
    durationDisplay: c.call_duration,
    recordingUrl: validRecordingUrl,
    internalRecordingUrl: validInternalRecordingUrl,
    sentimentScore: c.sentiment_score,
    sentimentDetails: c.sentiment_analysis_details,
    conversation: c.call_conversation,
    extractedVariables: c.extracted_variables || {},
    cost: c.aggregated_estimated_cost,
    tokens: {
      prompt: c.prompt_tokens,
      completion: c.completion_tokens,
      total: c.total_tokens,
    },
    requestId: requestIdStr,
    model: c.model_name,
  };
}

export function normalizeCampaignStatus(rawStatus?: string): string {
  if (!rawStatus) return 'DRAFT';
  const s = rawStatus.toLowerCase().trim();
  switch (s) {
    case 'draft':
      return 'DRAFT';
    case 'scheduled':
    case 'waiting':
      return 'SCHEDULED';
    case 'in_progress':
    case 'inprogress':
    case 'running':
    case 'active':
      return 'IN_PROGRESS';
    case 'paused':
      return 'PAUSED';
    case 'completed':
    case 'finished':
      return 'COMPLETED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELED';
    case 'failed':
      return 'FAILED';
    default:
      return 'DRAFT';
  }
}

export function normalizeLineCallStatus(rawStatus?: string): string {
  if (!rawStatus) return 'PENDING';
  const s = rawStatus.toLowerCase().trim();
  switch (s) {
    case 'pending':
    case 'queued':
    case 'retry_scheduled':
      return 'PENDING';
    case 'in progress':
    case 'in_progress':
    case 'dialing':
    case 'calling':
      return 'IN_PROGRESS';
    case 'completed':
    case 'voicemail_detected':
    case 'picked_up':
      return 'COMPLETED';
    case 'no-answer':
    case 'no_answer':
    case 'unanswered':
      return 'NO_ANSWER';
    case 'busy':
      return 'BUSY';
    case 'failed':
      return 'FAILED';
    case 'skipped':
      return 'SKIPPED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELED';
    default:
      return rawStatus.toUpperCase();
  }
}

export function mapSdkCampaignToNormalized(campaign: Record<string, unknown>): import('../provider-types').NormalizedCampaign {
  const c = campaign as {
    id?: number | string;
    name?: string;
    status?: string;
    bot_id?: number | string;
    twilio_number?: string;
    phone_number?: string;
    concurrent_call_limit?: number;
    timezone?: string;
    total_calls?: number;
    completed_calls?: number;
    failed_calls?: number;
    pending_calls?: number;
    create_date?: string;
    write_date?: string;
  };

  return {
    id: String(c.id ?? ''),
    name: c.name || 'Untitled Campaign',
    status: normalizeCampaignStatus(c.status),
    botId: c.bot_id !== undefined ? String(c.bot_id) : undefined,
    phoneNumber: c.twilio_number || c.phone_number,
    concurrency: c.concurrent_call_limit ?? 1,
    timezone: c.timezone || 'UTC',
    totalCalls: c.total_calls ?? 0,
    completedCalls: c.completed_calls ?? 0,
    failedCalls: c.failed_calls ?? 0,
    pendingCalls: c.pending_calls ?? 0,
    rawStatus: c.status,
    createdAt: c.create_date,
    updatedAt: c.write_date,
  };
}

export function mapSdkCampaignLiveStatus(raw: Record<string, unknown>): import('../provider-types').CampaignLiveStatus {
  const s = raw as {
    bulk_call_id?: number;
    campaign_status?: string;
    summary?: {
      total_contacts?: number;
      queued?: number;
      in_progress?: number;
      completed?: number;
      failed?: number;
      busy?: number;
      no_answer?: number;
    };
  };

  const summary = s.summary || {};
  return {
    campaignId: String(s.bulk_call_id ?? ''),
    status: normalizeCampaignStatus(s.campaign_status),
    totalContacts: summary.total_contacts ?? 0,
    queued: summary.queued ?? 0,
    inProgress: summary.in_progress ?? 0,
    completed: summary.completed ?? 0,
    failed: summary.failed ?? 0,
    busy: summary.busy ?? 0,
    noAnswer: summary.no_answer ?? 0,
  };
}

export function mapSdkCampaignLineToNormalized(line: Record<string, unknown>): import('../provider-types').CampaignLineRecord {
  const l = line as {
    id?: number | string;
    to_number?: string;
    from_number?: string;
    call_status?: string;
    failed_reason?: string | null;
    dispatched_at?: string;
    custom_variables?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    retry_attempt?: number;
    call_id?: number | string;
    duration?: number;
    recording_url?: string | null;
  };

  return {
    id: l.id !== undefined ? l.id : '',
    toNumber: l.to_number || '',
    fromNumber: l.from_number,
    callStatus: normalizeLineCallStatus(l.call_status),
    failureReason: l.failed_reason,
    dispatchedAt: l.dispatched_at,
    customVariables: l.custom_variables || {},
    metadata: l.metadata || {},
    retryAttempt: l.retry_attempt ?? 0,
    callId: l.call_id !== undefined ? l.call_id : undefined,
    duration: typeof l.duration === 'number' ? Math.round(l.duration) : 0,
    recordingUrl: typeof l.recording_url === 'string' && l.recording_url.startsWith('http') ? l.recording_url : null,
  };
}

export function mapSdkCampaignPoolNumber(item: Record<string, unknown>): import('../provider-types').CampaignNumberPoolItem {
  const n = item as {
    id?: number | string;
    phone_number_id?: number | string;
    phone_number?: string;
    is_active?: boolean;
    sequence?: number;
    health_score?: number | null;
    rolling_cpr?: number | null;
  };

  return {
    id: n.id !== undefined ? n.id : '',
    phoneNumberId: n.phone_number_id !== undefined ? n.phone_number_id : '',
    phoneNumber: n.phone_number || '',
    isActive: n.is_active !== false,
    sequence: n.sequence ?? 10,
    healthScore: typeof n.health_score === 'number' ? n.health_score : null,
    rollingCpr: typeof n.rolling_cpr === 'number' ? n.rolling_cpr : null,
  };
}
