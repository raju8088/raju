/**
 * VoiceNuvo — Unified Voice Provider Types & Interface
 * Decouples VoiceNuvo control plane from any specific external voice API.
 */

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
}

export interface ContextItem {
  id?: number;
  title: string;
  body: string;
  isEnabled?: boolean;
}

export interface CreateAgentInput {
  name: string;
  welcomeMessage?: string;
  voiceId?: string;
  voiceName?: string;
  voiceProvider?: string;
  model?: string;
  language?: string;
  speechSpeed?: number;
  enableWebSearch?: boolean;
  webSearchEngine?: string;
  voicemailEnabled?: boolean;
  voicemailMessage?: string;
  isEndCallEnabled?: boolean;
  endCallMessage?: string;
  maxDurationSec?: number;
  contextBreakdown?: ContextItem[];
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  status?: string;
}

export interface NormalizedAgent {
  id: string; // Provider agent ID
  name: string;
  status: string;
  welcomeMessage?: string;
  voiceId?: string;
  voiceName?: string;
  voiceProvider?: string;
  model?: string;
  language?: string;
  speechSpeed?: number;
  enableWebSearch?: boolean;
  voicemailEnabled?: boolean;
  voicemailMessage?: string;
  isEndCallEnabled?: boolean;
  endCallMessage?: string;
  maxDurationSec?: number;
  attachedFileIds?: number[];
  assignedPhoneNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NormalizedAgentVersion {
  versionNumber: number;
  name?: string;
  createdAt?: string;
  type?: 'manual' | 'auto' | 'system';
}

export interface NormalizedKnowledgeFile {
  id: string; // Provider file ID
  filename: string;
  status: string;
  mimeType?: string;
  fileSizeBytes?: number;
  createdAt?: string;
}

export interface UploadFileInput {
  filename: string;
  mimeType: string;
  content: Buffer | Uint8Array | string;
  fileSizeBytes?: number;
}

export interface NormalizedPhoneNumber {
  id: string; // Provider phone ID
  phoneNumber: string;
  region: 'US' | 'IN' | string;
  carrier?: string;
  status: string;
  assignedAgentId?: string;
  monthlyRentalUsd?: number;
  kycRequired?: boolean;
}

export interface SearchPhoneNumbersQuery {
  region: 'US' | 'IN';
  carrier?: string;
  limit?: number;
  page?: number;
}

export interface PurchasePhoneNumberInput {
  phoneNumber: string;
  carrier?: string;
  region?: 'US' | 'IN';
  idempotencyKey?: string;
}

export interface CatalogProvider {
  id: string;
  name: string;
  category: 'LLM' | 'STT' | 'TTS';
  models?: string[];
}

export interface CatalogVoice {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  gender?: string;
  language?: string;
  accent?: string;
  sampleUrl?: string;
}

/**
 * Universal Voice Provider Abstraction
 */
export interface VoiceProvider {
  readonly providerName: 'OMNIDIMENSION';

  // 1. Connection Lifecycle
  testConnection(): Promise<ConnectionTestResult>;

  // 2. Agents
  listAgents(params?: { limit?: number; page?: number }): Promise<{ agents: NormalizedAgent[]; total: number }>;
  getAgent(providerAgentId: string): Promise<NormalizedAgent>;
  createAgent(input: CreateAgentInput): Promise<NormalizedAgent>;
  updateAgent(providerAgentId: string, input: UpdateAgentInput): Promise<NormalizedAgent>;
  deleteAgent(providerAgentId: string): Promise<{ success: boolean; message?: string }>;

  // Agent Versions
  listAgentVersions(providerAgentId: string): Promise<NormalizedAgentVersion[]>;
  saveAgentVersion(providerAgentId: string, name?: string): Promise<NormalizedAgentVersion>;
  restoreAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean; restoredFrom?: number }>;
  diffAgentVersion(providerAgentId: string, versionNumber: number): Promise<unknown>;
  renameAgentVersion(providerAgentId: string, versionNumber: number, newName: string): Promise<{ success: boolean }>;
  deleteAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean }>;

  // 3. Knowledge Base
  listKnowledgeFiles(): Promise<NormalizedKnowledgeFile[]>;
  canUploadFile(fileSize: number, filename: string): Promise<{ canUpload: boolean; message?: string; quotaRemaining?: number }>;
  uploadKnowledgeFile(input: UploadFileInput): Promise<NormalizedKnowledgeFile>;
  attachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }>;
  detachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }>;
  deleteKnowledgeFile(fileId: string): Promise<{ success: boolean }>;

  // 4. Phone Numbers
  listPhoneNumbers(): Promise<NormalizedPhoneNumber[]>;
  searchPhoneNumbers(query: SearchPhoneNumbersQuery): Promise<NormalizedPhoneNumber[]>;
  purchasePhoneNumber(input: PurchasePhoneNumberInput): Promise<NormalizedPhoneNumber>;
  releasePhoneNumber(phoneNumber: string): Promise<{ success: boolean }>;
  attachPhoneNumber(phoneId: string, agentId: string): Promise<{ success: boolean }>;
  detachPhoneNumber(phoneId: string): Promise<{ success: boolean }>;

  // 5. Catalog
  listLLMs(): Promise<CatalogProvider[]>;
  listSTT(): Promise<CatalogProvider[]>;
  listTTS(): Promise<CatalogProvider[]>;
  listVoices(query?: { provider?: string; language?: string; accent?: string; search?: string }): Promise<CatalogVoice[]>;
  getVoice(voiceId: string): Promise<CatalogVoice | null>;

  // 6. Calling Engine (Phase 4)
  dispatchCall(input: DispatchCallInput): Promise<DispatchCallResult>;
  listCallLogs(query?: ListCallLogsQuery): Promise<{ logs: ProviderCallLog[]; total: number }>;
  getCallLog(providerCallId: string): Promise<ProviderCallLog>;

  // 7. Bulk Calling / Campaigns (Phase 5)
  getCapabilities(): ProviderCapabilities;
  createCampaign(input: CreateCampaignInput): Promise<{ providerCampaignId: string; status: string }>;
  startCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string; message?: string }>;
  getCampaign(providerCampaignId: string): Promise<NormalizedCampaign>;
  listCampaigns?(query?: { status?: string; limit?: number; page?: number }): Promise<{ campaigns: NormalizedCampaign[]; total: number }>;
  pauseCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }>;
  resumeCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }>;
  cancelCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }>;
  getCampaignLiveStatus(providerCampaignId: string): Promise<CampaignLiveStatus>;
  listCampaignLines(providerCampaignId: string, query?: ListCampaignLinesQuery): Promise<CampaignLinesResult>;
  addCampaignContacts(input: AddContactsInput): Promise<AddContactsResult>;
  setCampaignConcurrency(providerCampaignId: string, input: SetConcurrencyInput): Promise<{ success: boolean; concurrentCallLimit: number }>;
  setCampaignDailyTimeControl(providerCampaignId: string, input: SetDailyTimeControlInput): Promise<{ success: boolean }>;
  retryCampaign(providerCampaignId: string, input?: RetryCampaignInput): Promise<{ success: boolean; message?: string }>;
  listCampaignNumbers(providerCampaignId: string): Promise<CampaignNumberPoolItem[]>;
  addCampaignNumber(providerCampaignId: string, phoneNumberId: string | number): Promise<{ success: boolean }>;
  setCampaignNumberActive(providerCampaignId: string, assignmentId: string | number, isActive: boolean): Promise<{ success: boolean }>;
}

export interface ProviderCapabilities {
  bulkCampaigns: boolean;
  campaignPauseResume: boolean;
  campaignConcurrency: boolean;
  campaignRetry: boolean;
  campaignCallingWindows: boolean;
  campaignNumberRotation: boolean;
  campaignResults: boolean;
  campaignLiveStatus: boolean;
}

export interface CreateCampaignInput {
  name: string;
  phoneNumberId: string; // Provider phone number ID
  botId?: number; // Provider bot/agent ID
  saveAsDraft?: boolean;
  isDynamic?: boolean;
  contactList?: Array<{ phone_number: string; [key: string]: unknown }>;
  rotation?: {
    numbers: Array<{ phone_number_id: number; sequence?: number }>;
    strategy?: 'fixed_count' | 'cpr_threshold' | 'both' | 'none';
    calls_per_number?: number;
    health_threshold?: number;
    fallback?: 'pause' | 'continue_best';
  };
  timezone?: string;
  concurrentCallLimit?: number;
  retryConfig?: {
    auto_retry?: boolean;
    auto_retry_schedule?: 'immediately' | 'next_day' | 'scheduled_time';
    retry_schedule_days?: number;
    retry_schedule_hours?: number;
    retry_limit?: number;
  };
  isScheduled?: boolean;
  scheduledDatetime?: string;
}

export interface NormalizedCampaign {
  id: string; // Provider campaign ID
  name: string;
  status: string;
  botId?: string;
  phoneNumber?: string;
  concurrency?: number;
  timezone?: string;
  totalCalls?: number;
  completedCalls?: number;
  failedCalls?: number;
  pendingCalls?: number;
  rawStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignLiveStatus {
  campaignId: string;
  status: string;
  totalContacts: number;
  queued: number;
  inProgress: number;
  completed: number;
  failed: number;
  busy: number;
  noAnswer: number;
}

export interface CampaignLineRecord {
  id: string | number;
  toNumber: string;
  fromNumber?: string;
  callStatus: string;
  failureReason?: string | null;
  dispatchedAt?: string;
  customVariables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  retryAttempt?: number;
  callId?: string | number;
  duration?: number;
  recordingUrl?: string | null;
}

export interface CampaignLinesResult {
  records: CampaignLineRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  totalRecords?: number;
  pageSize?: number;
}

export interface ListCampaignLinesQuery {
  cursor?: string;
  pageSize?: number;
  status?: string;
  search?: string;
  includeTotal?: boolean;
}

export interface AddContactsInput {
  campaignId: string;
  contacts: Array<{
    toNumber: string;
    customVariables?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AddContactsResult {
  addedCount: number;
  rejectedCount: number;
  added: Array<{ lineId?: number; toNumber?: string }>;
  rejected: Array<{ index?: number; reason?: string }>;
  campaignId?: number;
  campaignStatus?: string;
}

export interface SetConcurrencyInput {
  concurrentCallLimit: number;
}

export interface SetDailyTimeControlInput {
  enableDailyHardStop: boolean;
  dailyStopTime?: number;
  dailyStopTimezone?: string;
  enableDailyAutoStart: boolean;
  dailyStartTime?: number;
  dailyStartTimezone?: string;
}

export interface RetryCampaignInput {
  retryStrategy?: string;
  maxRetries?: number;
  failureReasons?: string[];
}

export interface CampaignNumberPoolItem {
  id: string | number;
  phoneNumberId: string | number;
  phoneNumber: string;
  isActive: boolean;
  sequence?: number;
  healthScore?: number | null;
  rollingCpr?: number | null;
}

export interface DispatchCallInput {
  agentId: string;
  toNumber: string;
  fromNumberId?: string;
  callContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  postCallWebhookUrl?: string;
}

export interface DispatchCallResult {
  providerCallId?: string;
  providerRequestId?: string;
  status: string;
  customVariablesCount?: number;
}

export interface ProviderCallLog {
  id: string;
  agentName?: string;
  timeOfCall?: string;
  fromNumber?: string;
  toNumber?: string;
  direction: 'inbound' | 'outbound';
  status: string;
  durationSeconds: number;
  durationDisplay?: string;
  recordingUrl?: string | null;
  internalRecordingUrl?: string | null;
  sentimentScore?: string;
  sentimentDetails?: string;
  summary?: string;
  conversation?: string;
  extractedVariables?: Record<string, unknown>;
  cost?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  requestId?: string;
  model?: string;
}

export interface ListCallLogsQuery {
  page?: number;
  limit?: number;
  agentId?: string;
  status?: string;
}
