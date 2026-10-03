import type {
  VoiceProvider,
  ConnectionTestResult,
  NormalizedAgent,
  CreateAgentInput,
  UpdateAgentInput,
  NormalizedAgentVersion,
  NormalizedKnowledgeFile,
  UploadFileInput,
  NormalizedPhoneNumber,
  SearchPhoneNumbersQuery,
  PurchasePhoneNumberInput,
  CatalogProvider,
  CatalogVoice,
  DispatchCallInput,
  DispatchCallResult,
  ProviderCallLog,
  ListCallLogsQuery,
  ProviderCapabilities,
  CreateCampaignInput,
  NormalizedCampaign,
  CampaignLiveStatus,
  CampaignLineRecord,
  CampaignLinesResult,
  ListCampaignLinesQuery,
  AddContactsInput,
  AddContactsResult,
  SetConcurrencyInput,
  SetDailyTimeControlInput,
  RetryCampaignInput,
  CampaignNumberPoolItem,
} from './provider-types';

export class MockVoiceProvider implements VoiceProvider {
  readonly providerName = 'OMNIDIMENSION' as const;

  // Controllable test state
  public shouldFailConnection = false;
  public failureErrorMessage = 'Mock provider simulated failure';
  public shouldFailDispatch = false;
  public dispatchErrorMessage = 'Mock provider dispatch failed';
  public latencyMs = 15;

  private agents: Map<string, NormalizedAgent> = new Map();
  private versions: Map<string, NormalizedAgentVersion[]> = new Map();
  private files: Map<string, NormalizedKnowledgeFile> = new Map();
  private numbers: Map<string, NormalizedPhoneNumber> = new Map();
  private calls: Map<string, ProviderCallLog> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // Seed 1 default mock agent
    this.agents.set('mock_agent_1', {
      id: 'mock_agent_1',
      name: 'Customer Support AI',
      status: 'ACTIVE',
      welcomeMessage: 'Hello, welcome to Acme Support. How can I help you?',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      voiceName: 'Rachel',
      voiceProvider: 'elevenlabs',
      model: 'gpt-4o-mini',
      language: 'English',
      speechSpeed: 1.0,
      enableWebSearch: false,
      voicemailEnabled: true,
      maxDurationSec: 600,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.versions.set('mock_agent_1', [
      {
        versionNumber: 1,
        name: 'Initial setup',
        createdAt: new Date().toISOString(),
        type: 'manual',
      },
    ]);

    // Seed 1 mock KB file
    this.files.set('mock_file_1', {
      id: 'mock_file_1',
      filename: 'knowledge-base-faq.pdf',
      status: 'READY',
      mimeType: 'application/pdf',
      fileSizeBytes: 1048576,
      createdAt: new Date().toISOString(),
    });

    // Seed 1 mock phone number
    this.numbers.set('mock_phone_1', {
      id: 'mock_phone_1',
      phoneNumber: '+14155552671',
      region: 'US',
      carrier: 'Twilio',
      status: 'ACTIVE',
      monthlyRentalUsd: 2.0,
    });

    // Seed 1 mock call
    this.calls.set('mock_call_101', {
      id: 'mock_call_101',
      agentName: 'Customer Support AI',
      timeOfCall: '05/06/2026 13:31:54',
      fromNumber: '+14155552671',
      toNumber: '+14155550199',
      direction: 'outbound',
      status: 'completed',
      durationSeconds: 42,
      durationDisplay: '0:42',
      recordingUrl: 'https://cdn.omnidim.ai/recordings/mock_rec_101.mp3',
      sentimentScore: 'Positive',
      sentimentDetails: 'Caller was satisfied with product inquiries and scheduled an appointment.',
      summary: 'Customer called to inquire about 3BHK listings and booked a follow-up visit.',
      conversation: '<br/> Assistant: Hello, thank you for calling Acme Voice. How may I assist you today? <br/> <br/> User: Hi, I want to inquire about the 3BHK listing. <br/> <br/> Assistant: Absolutely! Would you like to schedule a visit? <br/> <br/> User: Yes please, tomorrow at 3 PM. <br/> <br/> Assistant: Booked! You will receive a confirmation shortly. Goodbye! <br/>',
      extractedVariables: { interest: '3BHK', appointmentTime: 'tomorrow at 3 PM' },
      cost: 0.04,
      tokens: { prompt: 140, completion: 52, total: 192 },
      requestId: 'mock_req_101',
      model: 'gpt-4o-mini',
    });
  }

  // 1. Connection
  async testConnection(): Promise<ConnectionTestResult> {
    if (this.shouldFailConnection) {
      return {
        success: false,
        message: this.failureErrorMessage,
        latencyMs: this.latencyMs,
      };
    }
    return {
      success: true,
      message: 'Mock OmniDimension connected successfully.',
      latencyMs: this.latencyMs,
    };
  }

  // 2. Agents
  async listAgents(params?: { limit?: number; page?: number }): Promise<{ agents: NormalizedAgent[]; total: number }> {
    const list = Array.from(this.agents.values());
    const limit = params?.limit || 50;
    const page = params?.page || 1;
    const start = (page - 1) * limit;
    return {
      agents: list.slice(start, start + limit),
      total: list.length,
    };
  }

  setMockAgents(agents: NormalizedAgent[]): void {
    this.agents.clear();
    for (const a of agents) {
      this.agents.set(a.id, a);
    }
  }

  clearMockAgents(): void {
    this.agents.clear();
  }

  async listAllAgents(): Promise<{ agents: NormalizedAgent[]; total: number; pagesFetched: number }> {
    if (this.shouldFailConnection) {
      throw new Error(this.failureErrorMessage);
    }
    const list = Array.from(this.agents.values());
    const pageSize = 150;
    const pagesFetched = Math.max(1, Math.ceil(list.length / pageSize));
    return {
      agents: list.map((a) => ({ ...a })),
      total: list.length,
      pagesFetched,
    };
  }

  async getAgent(providerAgentId: string): Promise<NormalizedAgent> {
    const agent = this.agents.get(providerAgentId);
    if (!agent) {
      throw new Error(`Agent not found on mock provider: ${providerAgentId}`);
    }
    return { ...agent };
  }

  async createAgent(input: CreateAgentInput): Promise<NormalizedAgent> {
    const id = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAgent: NormalizedAgent = {
      id,
      name: input.name,
      status: 'ACTIVE',
      welcomeMessage: input.welcomeMessage || 'Hello!',
      voiceId: input.voiceId || '21m00Tcm4TlvDq8ikWAM',
      voiceName: input.voiceName || 'Rachel',
      voiceProvider: input.voiceProvider || 'elevenlabs',
      model: input.model || 'gpt-4o-mini',
      language: input.language || 'English',
      speechSpeed: input.speechSpeed || 1.0,
      enableWebSearch: Boolean(input.enableWebSearch),
      voicemailEnabled: Boolean(input.voicemailEnabled),
      voicemailMessage: input.voicemailMessage,
      isEndCallEnabled: Boolean(input.isEndCallEnabled),
      endCallMessage: input.endCallMessage,
      maxDurationSec: input.maxDurationSec || 600,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.agents.set(id, newAgent);
    this.versions.set(id, [
      {
        versionNumber: 1,
        name: 'v1 Initial creation',
        createdAt: new Date().toISOString(),
        type: 'auto',
      },
    ]);

    return { ...newAgent };
  }

  async updateAgent(providerAgentId: string, input: UpdateAgentInput): Promise<NormalizedAgent> {
    const existing = await this.getAgent(providerAgentId);
    const updated: NormalizedAgent = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.agents.set(providerAgentId, updated);
    return { ...updated };
  }

  async deleteAgent(providerAgentId: string): Promise<{ success: boolean; message?: string }> {
    const existed = this.agents.delete(providerAgentId);
    this.versions.delete(providerAgentId);
    return { success: existed };
  }

  // Agent Versions
  async listAgentVersions(providerAgentId: string): Promise<NormalizedAgentVersion[]> {
    return this.versions.get(providerAgentId) || [];
  }

  async saveAgentVersion(providerAgentId: string, name?: string): Promise<NormalizedAgentVersion> {
    const existingVersions = this.versions.get(providerAgentId) || [];
    const nextVer = existingVersions.length + 1;
    const version: NormalizedAgentVersion = {
      versionNumber: nextVer,
      name: name || `Snapshot ${nextVer}`,
      createdAt: new Date().toISOString(),
      type: 'manual',
    };
    existingVersions.unshift(version);
    this.versions.set(providerAgentId, existingVersions);
    return version;
  }

  async restoreAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean; restoredFrom?: number }> {
    const list = this.versions.get(providerAgentId) || [];
    const target = list.find((v) => v.versionNumber === versionNumber);
    if (!target) throw new Error(`Version ${versionNumber} not found.`);
    return { success: true, restoredFrom: versionNumber };
  }

  async diffAgentVersion(providerAgentId: string, versionNumber: number): Promise<unknown> {
    return {
      changed: true,
      version: versionNumber,
      diffs: [{ field: 'speech_speed', old: '1.0', new: '1.2' }],
    };
  }

  async renameAgentVersion(providerAgentId: string, versionNumber: number, newName: string): Promise<{ success: boolean }> {
    const list = this.versions.get(providerAgentId) || [];
    const target = list.find((v) => v.versionNumber === versionNumber);
    if (target) target.name = newName;
    return { success: Boolean(target) };
  }

  async deleteAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean }> {
    let list = this.versions.get(providerAgentId) || [];
    list = list.filter((v) => v.versionNumber !== versionNumber);
    this.versions.set(providerAgentId, list);
    return { success: true };
  }

  // 3. Knowledge Base
  async listKnowledgeFiles(): Promise<NormalizedKnowledgeFile[]> {
    return Array.from(this.files.values());
  }

  async canUploadFile(_fileSize: number, _filename: string): Promise<{ canUpload: boolean; message?: string; quotaRemaining?: number }> {
    void _fileSize;
    void _filename;
    return { canUpload: true, quotaRemaining: 100000000 };
  }

  async uploadKnowledgeFile(input: UploadFileInput): Promise<NormalizedKnowledgeFile> {
    const id = `file_${Date.now()}`;
    const newFile: NormalizedKnowledgeFile = {
      id,
      filename: input.filename,
      status: 'READY',
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes || 50000,
      createdAt: new Date().toISOString(),
    };
    this.files.set(id, newFile);
    return { ...newFile };
  }

  async attachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }> {
    const agent = this.agents.get(agentId);
    if (agent) {
      const current = new Set(agent.attachedFileIds || []);
      fileIds.forEach((id) => current.add(Number(id) || 1));
      agent.attachedFileIds = Array.from(current);
    }
    return { success: true };
  }

  async detachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }> {
    const agent = this.agents.get(agentId);
    if (agent && agent.attachedFileIds) {
      const removeSet = new Set(fileIds.map(Number));
      agent.attachedFileIds = agent.attachedFileIds.filter((id) => !removeSet.has(id));
    }
    return { success: true };
  }

  async deleteKnowledgeFile(fileId: string): Promise<{ success: boolean }> {
    return { success: this.files.delete(fileId) };
  }

  // 4. Phone Numbers
  async listPhoneNumbers(): Promise<NormalizedPhoneNumber[]> {
    return Array.from(this.numbers.values());
  }

  async searchPhoneNumbers(query: SearchPhoneNumbersQuery): Promise<NormalizedPhoneNumber[]> {
    const prefix = query.region === 'IN' ? '+91' : '+1';
    return [
      {
        id: `avail_1`,
        phoneNumber: `${prefix}4155550101`,
        region: query.region,
        carrier: query.carrier || 'Tier1 Carrier',
        status: 'AVAILABLE',
        monthlyRentalUsd: query.region === 'IN' ? 1.5 : 2.0,
      },
      {
        id: `avail_2`,
        phoneNumber: `${prefix}4155550102`,
        region: query.region,
        carrier: query.carrier || 'Tier1 Carrier',
        status: 'AVAILABLE',
        monthlyRentalUsd: query.region === 'IN' ? 1.5 : 2.0,
      },
      {
        id: `avail_3`,
        phoneNumber: `${prefix}4155550103`,
        region: query.region,
        carrier: query.carrier || 'Tier1 Carrier',
        status: 'AVAILABLE',
        monthlyRentalUsd: query.region === 'IN' ? 1.5 : 2.0,
      },
    ];
  }

  async purchasePhoneNumber(input: PurchasePhoneNumberInput): Promise<NormalizedPhoneNumber> {
    const id = `phone_${Date.now()}`;
    const newPhone: NormalizedPhoneNumber = {
      id,
      phoneNumber: input.phoneNumber,
      region: input.region || 'US',
      carrier: input.carrier || 'Twilio',
      status: 'ACTIVE',
      monthlyRentalUsd: 2.0,
    };
    this.numbers.set(id, newPhone);
    return { ...newPhone };
  }

  async releasePhoneNumber(phoneNumber: string): Promise<{ success: boolean }> {
    for (const [id, p] of this.numbers.entries()) {
      if (p.phoneNumber === phoneNumber) {
        this.numbers.delete(id);
        return { success: true };
      }
    }
    return { success: true };
  }

  async attachPhoneNumber(phoneId: string, agentId: string): Promise<{ success: boolean }> {
    const phone = this.numbers.get(phoneId);
    if (phone) {
      phone.assignedAgentId = agentId;
    }
    return { success: true };
  }

  async detachPhoneNumber(phoneId: string): Promise<{ success: boolean }> {
    const phone = this.numbers.get(phoneId);
    if (phone) {
      phone.assignedAgentId = undefined;
    }
    return { success: true };
  }

  // 5. Catalog
  async listLLMs(): Promise<CatalogProvider[]> {
    return [
      { id: 'openai', name: 'OpenAI', category: 'LLM', models: ['gpt-4o', 'gpt-4o-mini'] },
      { id: 'anthropic', name: 'Anthropic', category: 'LLM', models: ['claude-3-5-sonnet', 'claude-3-haiku'] },
      { id: 'groq', name: 'Groq (Ultra-low latency)', category: 'LLM', models: ['llama-3.1-70b', 'llama-3.1-8b'] },
    ];
  }

  async listSTT(): Promise<CatalogProvider[]> {
    return [
      { id: 'deepgram', name: 'Deepgram Nova-2', category: 'STT' },
      { id: 'google', name: 'Google Speech-to-Text', category: 'STT' },
    ];
  }

  async listTTS(): Promise<CatalogProvider[]> {
    return [
      { id: 'elevenlabs', name: 'ElevenLabs Multilingual v2', category: 'TTS' },
      { id: 'cartesia', name: 'Cartesia Sonic', category: 'TTS' },
      { id: 'playht', name: 'PlayHT 2.0', category: 'TTS' },
    ];
  }

  async listVoices(): Promise<CatalogVoice[]> {
    return [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'rachel', displayName: 'Rachel (Calm & Professional)', provider: 'elevenlabs', gender: 'Female', language: 'en-US' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'domi', displayName: 'Domi (Friendly & Energetic)', provider: 'elevenlabs', gender: 'Female', language: 'en-US' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'bella', displayName: 'Bella (Warm & Expressive)', provider: 'elevenlabs', gender: 'Female', language: 'en-US' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'antoni', displayName: 'Antoni (Deep & Confident)', provider: 'elevenlabs', gender: 'Male', language: 'en-US' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'arnold', displayName: 'Arnold (Clear & Authoritative)', provider: 'elevenlabs', gender: 'Male', language: 'en-US' },
    ];
  }

  async getVoice(voiceId: string): Promise<CatalogVoice | null> {
    const voices = await this.listVoices();
    return voices.find((v) => v.id === voiceId) || null;
  }

  // 6. Calling Engine
  async dispatchCall(input: DispatchCallInput): Promise<DispatchCallResult> {
    if (this.shouldFailDispatch) {
      throw new Error(this.dispatchErrorMessage);
    }

    const mockCallId = `mock_call_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const mockRequestId = `mock_req_${Date.now()}`;

    // Store in mock call log
    this.calls.set(mockCallId, {
      id: mockCallId,
      agentName: 'Mock Agent',
      timeOfCall: new Date().toISOString(),
      fromNumber: input.fromNumberId ? `mock_num_${input.fromNumberId}` : '+14155552671',
      toNumber: input.toNumber,
      direction: 'outbound',
      status: 'completed',
      durationSeconds: 30,
      durationDisplay: '0:30',
      recordingUrl: `https://cdn.omnidim.ai/recordings/${mockCallId}.mp3`,
      sentimentScore: 'Positive',
      sentimentDetails: 'Call completed successfully with high engagement.',
      summary: 'Automated outbound call dispatched and verified.',
      conversation: '<br/> Assistant: Hello, this is a test call. <br/> <br/> User: Hello, thank you. <br/>',
      extractedVariables: (input.callContext as Record<string, unknown>) || {},
      cost: 0.03,
      tokens: { prompt: 100, completion: 30, total: 130 },
      requestId: mockRequestId,
      model: 'gpt-4o-mini',
    });

    return {
      providerCallId: mockCallId,
      providerRequestId: mockRequestId,
      status: 'dispatched',
      customVariablesCount: input.callContext ? Object.keys(input.callContext).length : 0,
    };
  }

  async listCallLogs(query?: ListCallLogsQuery): Promise<{ logs: ProviderCallLog[]; total: number }> {
    const all = Array.from(this.calls.values());
    let filtered = all;

    if (query?.status) {
      filtered = filtered.filter((c) => c.status.toLowerCase() === query.status?.toLowerCase());
    }

    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    return {
      logs: paged,
      total: filtered.length,
    };
  }

  async getCallLog(providerCallId: string): Promise<ProviderCallLog> {
    const found = this.calls.get(providerCallId);
    if (!found) {
      throw new Error(`Call log not found on provider: ${providerCallId}`);
    }
    return found;
  }

  // ==========================================
  // 7. Bulk Calling / Campaigns (Phase 5 Mock)
  // ==========================================

  public campaigns: Map<string, NormalizedCampaign> = new Map();
  public campaignLines: Map<string, CampaignLineRecord[]> = new Map();
  public campaignNumbers: Map<string, CampaignNumberPoolItem[]> = new Map();
  public campaignCallingWindows: Map<string, SetDailyTimeControlInput> = new Map();

  getCapabilities(): ProviderCapabilities {
    return {
      bulkCampaigns: true,
      campaignPauseResume: true,
      campaignConcurrency: true,
      campaignRetry: true,
      campaignCallingWindows: true,
      campaignNumberRotation: true,
      campaignResults: true,
      campaignLiveStatus: true,
    };
  }

  async createCampaign(input: CreateCampaignInput): Promise<{ providerCampaignId: string; status: string }> {
    const id = `mock_campaign_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const status = input.saveAsDraft ? 'DRAFT' : 'IN_PROGRESS';

    const campaign: NormalizedCampaign = {
      id,
      name: input.name,
      status,
      botId: input.botId !== undefined ? String(input.botId) : undefined,
      phoneNumber: String(input.phoneNumberId),
      concurrency: input.concurrentCallLimit ?? 1,
      timezone: input.timezone || 'UTC',
      totalCalls: input.contactList ? input.contactList.length : 0,
      completedCalls: 0,
      failedCalls: 0,
      pendingCalls: input.contactList ? input.contactList.length : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.campaigns.set(id, campaign);

    const initialLines: CampaignLineRecord[] = (input.contactList || []).map((c, idx) => ({
      id: `line_${id}_${idx + 1}`,
      toNumber: c.phone_number,
      callStatus: 'PENDING',
      customVariables: c,
      metadata: {},
      retryAttempt: 0,
      duration: 0,
    }));
    this.campaignLines.set(id, initialLines);

    // Initial pool number
    const poolNum: CampaignNumberPoolItem = {
      id: `pool_num_${id}_1`,
      phoneNumberId: input.phoneNumberId,
      phoneNumber: String(input.phoneNumberId),
      isActive: true,
      sequence: 10,
      healthScore: 100,
      rollingCpr: 80,
    };
    this.campaignNumbers.set(id, [poolNum]);

    return {
      providerCampaignId: id,
      status,
    };
  }

  async startCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string; message?: string }> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found on mock provider: ${providerCampaignId}`);
    c.status = 'IN_PROGRESS';
    c.updatedAt = new Date().toISOString();

    // Progress some lines to completed for simulation
    const lines = this.campaignLines.get(providerCampaignId) || [];
    lines.forEach((l, idx) => {
      if (idx % 2 === 0) {
        l.callStatus = 'COMPLETED';
        l.duration = 45;
      }
    });

    return { success: true, status: 'IN_PROGRESS', message: 'Campaign started successfully' };
  }

  async getCampaign(providerCampaignId: string): Promise<NormalizedCampaign> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found on mock provider: ${providerCampaignId}`);
    return c;
  }

  async listCampaigns(query?: { status?: string; limit?: number; page?: number }): Promise<{ campaigns: NormalizedCampaign[]; total: number }> {
    let all = Array.from(this.campaigns.values());
    if (query?.status) {
      all = all.filter((c) => c.status.toLowerCase() === query.status?.toLowerCase());
    }
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const start = (page - 1) * limit;
    return {
      campaigns: all.slice(start, start + limit),
      total: all.length,
    };
  }

  async pauseCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found: ${providerCampaignId}`);
    c.status = 'PAUSED';
    return { success: true, status: 'PAUSED' };
  }

  async resumeCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found: ${providerCampaignId}`);
    c.status = 'IN_PROGRESS';
    return { success: true, status: 'IN_PROGRESS' };
  }

  async cancelCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found: ${providerCampaignId}`);
    c.status = 'CANCELED';
    return { success: true, status: 'CANCELED' };
  }

  async getCampaignLiveStatus(providerCampaignId: string): Promise<CampaignLiveStatus> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found: ${providerCampaignId}`);
    const lines = this.campaignLines.get(providerCampaignId) || [];

    let queued = 0;
    let inProgress = 0;
    let completed = 0;
    let failed = 0;
    let busy = 0;
    let noAnswer = 0;

    for (const l of lines) {
      const s = l.callStatus.toUpperCase();
      if (s === 'PENDING') queued++;
      else if (s === 'IN_PROGRESS') inProgress++;
      else if (s === 'COMPLETED') completed++;
      else if (s === 'FAILED') failed++;
      else if (s === 'BUSY') busy++;
      else if (s === 'NO_ANSWER') noAnswer++;
      else queued++;
    }

    return {
      campaignId: providerCampaignId,
      status: c.status,
      totalContacts: lines.length,
      queued,
      inProgress,
      completed,
      failed,
      busy,
      noAnswer,
    };
  }

  async listCampaignLines(providerCampaignId: string, query?: ListCampaignLinesQuery): Promise<CampaignLinesResult> {
    const all = this.campaignLines.get(providerCampaignId) || [];
    let filtered = all;

    if (query?.status) {
      filtered = filtered.filter((l) => l.callStatus.toLowerCase() === query.status?.toLowerCase());
    }
    if (query?.search) {
      filtered = filtered.filter((l) => l.toNumber.includes(query.search!));
    }

    const pageSize = query?.pageSize || 50;
    const offset = query?.cursor ? Number(query.cursor) || 0 : 0;
    const records = filtered.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const hasMore = nextOffset < filtered.length;

    return {
      records,
      hasMore,
      nextCursor: hasMore ? String(nextOffset) : null,
      totalRecords: filtered.length,
      pageSize,
    };
  }

  async addCampaignContacts(input: AddContactsInput): Promise<AddContactsResult> {
    const lines = this.campaignLines.get(input.campaignId) || [];
    const added: Array<{ lineId?: number; toNumber?: string }> = [];

    input.contacts.forEach((c, idx) => {
      const lineId = lines.length + idx + 1;
      lines.push({
        id: lineId,
        toNumber: c.toNumber,
        callStatus: 'PENDING',
        customVariables: c.customVariables || {},
        metadata: c.metadata || {},
        retryAttempt: 0,
        duration: 0,
      });
      added.push({ lineId, toNumber: c.toNumber });
    });

    this.campaignLines.set(input.campaignId, lines);
    const campaign = this.campaigns.get(input.campaignId);
    if (campaign) {
      campaign.totalCalls = lines.length;
    }

    return {
      addedCount: added.length,
      rejectedCount: 0,
      added,
      rejected: [],
      campaignId: Number(input.campaignId) || undefined,
      campaignStatus: campaign?.status,
    };
  }

  async setCampaignConcurrency(providerCampaignId: string, input: SetConcurrencyInput): Promise<{ success: boolean; concurrentCallLimit: number }> {
    const c = this.campaigns.get(providerCampaignId);
    if (!c) throw new Error(`Campaign not found: ${providerCampaignId}`);
    c.concurrency = input.concurrentCallLimit;
    return { success: true, concurrentCallLimit: input.concurrentCallLimit };
  }

  async setCampaignDailyTimeControl(providerCampaignId: string, input: SetDailyTimeControlInput): Promise<{ success: boolean }> {
    this.campaignCallingWindows.set(providerCampaignId, input);
    return { success: true };
  }

  async retryCampaign(providerCampaignId: string, input?: RetryCampaignInput): Promise<{ success: boolean; message?: string }> {
    const lines = this.campaignLines.get(providerCampaignId) || [];
    let retriedCount = 0;

    lines.forEach((l) => {
      const s = l.callStatus.toUpperCase();
      const reasons = input?.failureReasons ? input.failureReasons.map((r) => r.toUpperCase()) : ['FAILED', 'NO_ANSWER', 'BUSY'];
      if (reasons.includes(s)) {
        l.callStatus = 'PENDING';
        l.retryAttempt = (l.retryAttempt || 0) + 1;
        retriedCount++;
      }
    });

    return { success: true, message: `${retriedCount} contacts re-queued for retry` };
  }

  async listCampaignNumbers(providerCampaignId: string): Promise<CampaignNumberPoolItem[]> {
    return this.campaignNumbers.get(providerCampaignId) || [];
  }

  async addCampaignNumber(providerCampaignId: string, phoneNumberId: string | number): Promise<{ success: boolean }> {
    const pool = this.campaignNumbers.get(providerCampaignId) || [];
    pool.push({
      id: `pool_num_${Date.now()}`,
      phoneNumberId,
      phoneNumber: String(phoneNumberId),
      isActive: true,
      sequence: (pool.length + 1) * 10,
      healthScore: 100,
      rollingCpr: 85,
    });
    this.campaignNumbers.set(providerCampaignId, pool);
    return { success: true };
  }

  async setCampaignNumberActive(providerCampaignId: string, assignmentId: string | number, isActive: boolean): Promise<{ success: boolean }> {
    const pool = this.campaignNumbers.get(providerCampaignId) || [];
    const item = pool.find((p) => String(p.id) === String(assignmentId) || String(p.phoneNumberId) === String(assignmentId));
    if (item) {
      item.isActive = isActive;
    }
    return { success: true };
  }
}
