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
  CampaignLinesResult,
  ListCampaignLinesQuery,
  AddContactsInput,
  AddContactsResult,
  SetConcurrencyInput,
  SetDailyTimeControlInput,
  RetryCampaignInput,
  CampaignNumberPoolItem,
} from '../provider-types';
import { withOmniDimension } from './omnidimension.client';
import {
  mapSdkAgentToNormalized,
  mapSdkAgentVersionToNormalized,
  mapSdkFileToNormalized,
  mapSdkPhoneToNormalized,
  mapSdkVoiceToCatalog,
  mapSdkProviderToCatalog,
  mapSdkCallToNormalized,
  mapSdkCampaignToNormalized,
  mapSdkCampaignLiveStatus,
  mapSdkCampaignLineToNormalized,
  mapSdkCampaignPoolNumber,
} from './omnidimension.mapper';

export class OmniDimensionProvider implements VoiceProvider {
  readonly providerName = 'OMNIDIMENSION' as const;
  private readonly apiKey: string;
  private readonly baseUrl?: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  // 1. Connection Verification
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await withOmniDimension(this.apiKey, async (client) => {
        // Lightweight probe: list 1 agent
        await client.agents.list({ pagesize: 1 });
      });
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: 'Successfully connected to OmniDimension API.',
        latencyMs,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // 2. Agents
  async listAgents(params?: { limit?: number; page?: number }): Promise<{ agents: NormalizedAgent[]; total: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.agents.list({
        pagesize: params?.limit || 50,
        pageno: params?.page || 1,
      });
      const bots = res.bots || [];
      return {
        agents: bots.map((b) => mapSdkAgentToNormalized(b as Record<string, unknown>)),
        total: res.total_records ?? bots.length,
      };
    });
  }

  async getAgent(providerAgentId: string): Promise<NormalizedAgent> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.get(id);
      return mapSdkAgentToNormalized(res as Record<string, unknown>);
    });
  }

  async createAgent(input: CreateAgentInput): Promise<NormalizedAgent> {
    return withOmniDimension(this.apiKey, async (client) => {
      const body: Record<string, unknown> = {
        name: input.name,
        welcome_message: input.welcomeMessage || 'Hello! How can I assist you today?',
        voice_provider: input.voiceProvider || 'elevenlabs',
        voice_name: input.voiceName || 'Rachel',
        llm_service: input.model || 'gpt-4o-mini',
        speech_speed: input.speechSpeed ?? 1.0,
        enable_web_search: Boolean(input.enableWebSearch),
        voicemail_enabled: Boolean(input.voicemailEnabled),
        voicemail_message: input.voicemailMessage || '',
        is_end_call_enabled: Boolean(input.isEndCallEnabled),
        end_call_message: input.endCallMessage || 'Thank you for calling. Goodbye!',
        max_call_duration_in_sec: input.maxDurationSec || 600,
      };

      if (input.voiceId) {
        body.voice_external_id = input.voiceId;
      }

      body.context_breakdown = (input.contextBreakdown && input.contextBreakdown.length > 0)
        ? input.contextBreakdown.map((c) => ({
            title: c.title,
            body: c.body,
            is_enabled: c.isEnabled ?? true,
          }))
        : [
            {
              title: 'Instructions',
              body: input.welcomeMessage || 'Assist callers professionally and clearly.',
              is_enabled: true,
            },
          ];

      const created = await client.agents.create(
        body as unknown as Parameters<typeof client.agents.create>[0]
      );
      const agentId = String(created.id || '');
      return {
        id: agentId,
        name: created.name || input.name,
        status: created.status || 'ACTIVE',
        welcomeMessage: input.welcomeMessage,
        voiceName: input.voiceName,
        voiceProvider: input.voiceProvider,
        model: input.model,
        speechSpeed: input.speechSpeed,
        enableWebSearch: input.enableWebSearch,
        voicemailEnabled: input.voicemailEnabled,
        maxDurationSec: input.maxDurationSec,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async updateAgent(providerAgentId: string, input: UpdateAgentInput): Promise<NormalizedAgent> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const body: Record<string, unknown> = {};

      if (input.name !== undefined) body.name = input.name;
      if (input.welcomeMessage !== undefined) body.welcome_message = input.welcomeMessage;
      if (input.voiceProvider !== undefined) body.voice_provider = input.voiceProvider;
      if (input.voiceName !== undefined) body.voice_name = input.voiceName;
      if (input.voiceId !== undefined) body.voice_external_id = input.voiceId;
      if (input.model !== undefined) body.llm_service = input.model;
      if (input.speechSpeed !== undefined) body.speech_speed = input.speechSpeed;
      if (input.enableWebSearch !== undefined) body.enable_web_search = input.enableWebSearch;
      if (input.voicemailEnabled !== undefined) body.voicemail_enabled = input.voicemailEnabled;
      if (input.voicemailMessage !== undefined) body.voicemail_message = input.voicemailMessage;
      if (input.isEndCallEnabled !== undefined) body.is_end_call_enabled = input.isEndCallEnabled;
      if (input.endCallMessage !== undefined) body.end_call_message = input.endCallMessage;
      if (input.maxDurationSec !== undefined) body.max_call_duration_in_sec = input.maxDurationSec;

      if (input.contextBreakdown) {
        body.context_breakdown = input.contextBreakdown.map((c, i) => ({
          id: i + 1,
          context_title: c.title,
          context_body: c.body,
          is_enabled: c.isEnabled ?? true,
        }));
      }

      await client.agents.update(
        id,
        body as unknown as Parameters<typeof client.agents.update>[1]
      );
      // Fetch fresh updated representation
      const updated = await client.agents.get(id);
      return mapSdkAgentToNormalized(updated as Record<string, unknown>);
    });
  }

  async deleteAgent(providerAgentId: string): Promise<{ success: boolean; message?: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.delete(id);
      return {
        success: Boolean(res.success ?? true),
        message: res.message,
      };
    });
  }

  // Agent Versions
  async listAgentVersions(providerAgentId: string): Promise<NormalizedAgentVersion[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.listVersions(id);
      const versions = res.versions || [];
      return versions.map((v) => mapSdkAgentVersionToNormalized(v as Record<string, unknown>));
    });
  }

  async saveAgentVersion(providerAgentId: string, name?: string): Promise<NormalizedAgentVersion> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.saveVersion(
        id,
        { name: name || `Snapshot ${new Date().toLocaleDateString()}` } as unknown as Parameters<typeof client.agents.saveVersion>[1]
      );
      return mapSdkAgentVersionToNormalized((res.version || { version_number: 1, name }) as Record<string, unknown>);
    });
  }

  async restoreAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean; restoredFrom?: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.restoreVersion(id, versionNumber);
      return {
        success: Boolean(res.success ?? true),
        restoredFrom: res.restored_from,
      };
    });
  }

  async diffAgentVersion(providerAgentId: string, versionNumber: number): Promise<unknown> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      return await client.agents.diffVersion(id, versionNumber);
    });
  }

  async renameAgentVersion(providerAgentId: string, versionNumber: number, newName: string): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.renameVersion(
        id,
        versionNumber,
        { name: newName } as unknown as Parameters<typeof client.agents.renameVersion>[2]
      );
      return { success: Boolean(res.success ?? true) };
    });
  }

  async deleteAgentVersion(providerAgentId: string, versionNumber: number): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerAgentId) || providerAgentId;
      const res = await client.agents.deleteVersion(id, versionNumber);
      return { success: Boolean(res.success ?? true) };
    });
  }

  // 3. Knowledge Base
  async listKnowledgeFiles(): Promise<NormalizedKnowledgeFile[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.knowledgeBase.list();
      const files = res.files || [];
      return files.map((f) => mapSdkFileToNormalized(f as Record<string, unknown>));
    });
  }

  async canUploadFile(fileSize: number, filename: string): Promise<{ canUpload: boolean; message?: string; quotaRemaining?: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const ext = filename.split('.').pop() || 'pdf';
      const res = await client.knowledgeBase.canUpload({
        file_size: fileSize,
        file_type: ext,
      } as unknown as Parameters<typeof client.knowledgeBase.canUpload>[0]);
      return {
        canUpload: Boolean(res.success ?? true),
        message: res.message,
        quotaRemaining: res.quota?.remaining,
      };
    });
  }

  async uploadKnowledgeFile(input: UploadFileInput): Promise<NormalizedKnowledgeFile> {
    return withOmniDimension(this.apiKey, async (client) => {
      const contentStr = typeof input.content === 'string'
        ? input.content
        : Buffer.from(input.content).toString('base64');

      const res = await client.knowledgeBase.upload({
        filename: input.filename,
        file: contentStr,
      } as unknown as Parameters<typeof client.knowledgeBase.upload>[0]);

      if (res.file) {
        return mapSdkFileToNormalized(res.file as Record<string, unknown>);
      }

      return {
        id: `kb_${Date.now()}`,
        filename: input.filename,
        status: 'READY',
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        createdAt: new Date().toISOString(),
      };
    });
  }

  async attachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const botId = Number(agentId) || agentId;
      const numericIds = fileIds.map((id) => Number(id) || id);
      const res = await client.knowledgeBase.attach({
        bot_id: botId,
        file_ids: numericIds,
      } as unknown as Parameters<typeof client.knowledgeBase.attach>[0]);
      return { success: Boolean(res.success ?? true) };
    });
  }

  async detachKnowledgeFiles(agentId: string, fileIds: string[]): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const botId = Number(agentId) || agentId;
      const numericIds = fileIds.map((id) => Number(id) || id);
      const res = await client.knowledgeBase.detach({
        bot_id: botId,
        file_ids: numericIds,
      } as unknown as Parameters<typeof client.knowledgeBase.detach>[0]);
      return { success: Boolean(res.success ?? true) };
    });
  }

  async deleteKnowledgeFile(fileId: string): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(fileId) || fileId;
      const res = await client.knowledgeBase.delete({
        file_id: id,
      } as unknown as Parameters<typeof client.knowledgeBase.delete>[0]);
      return { success: Boolean(res.success ?? true) };
    });
  }

  // 4. Phone Numbers
  async listPhoneNumbers(): Promise<NormalizedPhoneNumber[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.phoneNumbers.list();
      const numbers = res.phone_numbers || [];
      return numbers.map((p) => mapSdkPhoneToNormalized(p as Record<string, unknown>));
    });
  }

  async searchPhoneNumbers(query: SearchPhoneNumbersQuery): Promise<NormalizedPhoneNumber[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.phoneNumbers.search({
        region: query.region,
        carrier: query.carrier,
        limit: query.limit || 20,
        page: query.page || 1,
      } as unknown as Parameters<typeof client.phoneNumbers.search>[0]);
      const rawNumbers = res.numbers || [];
      return rawNumbers.map((n, i) => ({
        id: `avail_${n.phone_number || i}`,
        phoneNumber: n.phone_number || '',
        region: n.region || query.region,
        carrier: res.carrier_label || res.carrier || 'Default',
        status: 'AVAILABLE',
        monthlyRentalUsd: n.monthly_rental_usd,
        kycRequired: Boolean(n.kyc_required),
      }));
    });
  }

  async purchasePhoneNumber(input: PurchasePhoneNumberInput): Promise<NormalizedPhoneNumber> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.phoneNumbers.purchase(
        {
          phone_number: input.phoneNumber,
          carrier: input.carrier || 'Default',
          region: input.region || 'US',
        } as unknown as Parameters<typeof client.phoneNumbers.purchase>[0],
        input.idempotencyKey
      );

      return {
        id: String(res.order_id || Date.now()),
        phoneNumber: res.phone_number || input.phoneNumber,
        region: input.region || 'US',
        carrier: input.carrier,
        status: 'ACTIVE',
        monthlyRentalUsd: res.amount,
      };
    });
  }

  async releasePhoneNumber(phoneNumber: string): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.phoneNumbers.release({
        phone_number: phoneNumber,
      } as unknown as Parameters<typeof client.phoneNumbers.release>[0]);
      return { success: Boolean(res.success ?? true) };
    });
  }

  async attachPhoneNumber(phoneId: string, agentId: string): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const pId = Number(phoneId) || phoneId;
      const aId = Number(agentId) || agentId;
      const res = await client.phoneNumbers.attach({
        phone_number_id: pId,
        agent_id: aId,
      } as unknown as Parameters<typeof client.phoneNumbers.attach>[0]);
      return { success: Boolean(res.phone_number_id || res.message) };
    });
  }

  async detachPhoneNumber(phoneId: string): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const pId = Number(phoneId) || phoneId;
      const res = await client.phoneNumbers.detach({
        phone_number_id: pId,
      } as unknown as Parameters<typeof client.phoneNumbers.detach>[0]);
      return { success: Boolean(res.phone_number_id || res.message) };
    });
  }

  // 5. Catalog
  async listLLMs(): Promise<CatalogProvider[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.providers.listLLMs();
      const llms = res.llms || [];
      return llms.map((p) => mapSdkProviderToCatalog(p as Record<string, unknown>, 'LLM'));
    });
  }

  async listSTT(): Promise<CatalogProvider[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.providers.listSTT();
      const stts = res.stt || [];
      return stts.map((p) => mapSdkProviderToCatalog(p as Record<string, unknown>, 'STT'));
    });
  }

  async listTTS(): Promise<CatalogProvider[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.providers.listTTS();
      const ttss = res.tts || [];
      return ttss.map((p) => mapSdkProviderToCatalog(p as Record<string, unknown>, 'TTS'));
    });
  }

  async listVoices(query?: { provider?: string; language?: string; accent?: string; search?: string }): Promise<CatalogVoice[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const res = await client.providers.listVoices(
        query as unknown as Parameters<typeof client.providers.listVoices>[0]
      );
      const voices = res.voices || [];
      return voices.map((v) => mapSdkVoiceToCatalog(v as Record<string, unknown>));
    });
  }

  async getVoice(voiceId: string): Promise<CatalogVoice | null> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(voiceId) || voiceId;
      const voice = await client.providers.getVoice(id);
      if (!voice || !voice.id) return null;
      return mapSdkVoiceToCatalog(voice as Record<string, unknown>);
    });
  }

  // 6. Calling Engine (Phase 4)
  async dispatchCall(input: DispatchCallInput): Promise<DispatchCallResult> {
    return withOmniDimension(this.apiKey, async (client) => {
      const agentIdNum = Number(input.agentId);
      const fromNumberIdNum = input.fromNumberId ? Number(input.fromNumberId) : undefined;

      const body: Record<string, unknown> = {
        agent_id: !Number.isNaN(agentIdNum) ? agentIdNum : input.agentId,
        to_number: input.toNumber,
      };

      if (fromNumberIdNum !== undefined && !Number.isNaN(fromNumberIdNum)) {
        body.from_number_id = fromNumberIdNum;
      }

      if (input.callContext && Object.keys(input.callContext).length > 0) {
        body.call_context = input.callContext;
      }

      if (input.metadata && Object.keys(input.metadata).length > 0) {
        body.metadata = input.metadata;
      }

      const res = await client.calls.dispatch(
        body as unknown as Parameters<typeof client.calls.dispatch>[0]
      );

      return {
        providerRequestId: res.requestId !== undefined ? String(res.requestId) : undefined,
        status: res.status || 'dispatched',
        customVariablesCount: res.custom_variables_count,
      };
    });
  }

  async listCallLogs(query?: ListCallLogsQuery): Promise<{ logs: ProviderCallLog[]; total: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const queryParams: Record<string, unknown> = {
        pageno: query?.page || 1,
        pagesize: query?.limit || 20,
      };

      if (query?.agentId) {
        const agentNum = Number(query.agentId);
        if (!Number.isNaN(agentNum)) {
          queryParams.agentid = agentNum;
        }
      }

      if (query?.status) {
        queryParams.call_status = query.status;
      }

      const res = await client.calls.listLogs(
        queryParams as unknown as Parameters<typeof client.calls.listLogs>[0]
      );

      const logs = (res.call_log_data || []).map((c) =>
        mapSdkCallToNormalized(c as Record<string, unknown>)
      );

      return {
        logs,
        total: res.total_records || logs.length,
      };
    });
  }

  async getCallLog(providerCallId: string): Promise<ProviderCallLog> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCallId) || providerCallId;
      const res = await client.calls.getLog(id as number);

      const rawData = Array.isArray(res.call_log_data) && res.call_log_data.length > 0
        ? res.call_log_data[0]
        : res;

      return mapSdkCallToNormalized(rawData as Record<string, unknown>);
    });
  }

  // ==========================================
  // 7. Bulk Calling / Campaigns (Phase 5)
  // ==========================================

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
    return withOmniDimension(this.apiKey, async (client) => {
      const payload: Record<string, unknown> = {
        name: input.name,
        phone_number_id: String(input.phoneNumberId),
        save_as_draft: input.saveAsDraft ?? true,
        is_dynamic: input.isDynamic ?? true,
      };

      if (input.botId !== undefined) {
        payload.bot_id = Number(input.botId);
      }
      if (input.concurrentCallLimit !== undefined) {
        payload.concurrent_call_limit = input.concurrentCallLimit;
      }
      if (input.timezone) {
        payload.timezone = input.timezone;
      }
      if (input.isScheduled !== undefined) {
        payload.is_scheduled = input.isScheduled;
      }
      if (input.scheduledDatetime) {
        payload.scheduled_datetime = input.scheduledDatetime;
      }
      if (input.retryConfig) {
        payload.retry_config = input.retryConfig;
      }
      if (input.rotation) {
        payload.rotation = input.rotation;
      }
      if (Array.isArray(input.contactList) && input.contactList.length > 0) {
        payload.contact_list = input.contactList;
      }

      const res = await client.bulkCalls.create(
        payload as unknown as Parameters<typeof client.bulkCalls.create>[0]
      );

      return {
        providerCampaignId: String(res.id ?? ''),
        status: res.current_status || 'draft',
      };
    });
  }

  async startCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string; message?: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.start(id);
      return {
        success: res.status === 'success' || !res.status || res.current_status === 'in_progress',
        status: res.current_status || 'in_progress',
        message: res.message,
      };
    });
  }

  async getCampaign(providerCampaignId: string): Promise<NormalizedCampaign> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.get(id);
      const details = (res.details || res) as Record<string, unknown>;
      return mapSdkCampaignToNormalized(details);
    });
  }

  async listCampaigns(query?: { status?: string; limit?: number; page?: number }): Promise<{ campaigns: NormalizedCampaign[]; total: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const q: Record<string, unknown> = {};
      if (query?.status) q.status = query.status;
      if (query?.limit) q.pagesize = query.limit;
      if (query?.page) q.page = query.page;

      const res = await client.bulkCalls.list(
        q as unknown as Parameters<typeof client.bulkCalls.list>[0]
      );
      const records = res.records || [];
      const campaigns = records.map((r) => mapSdkCampaignToNormalized(r as Record<string, unknown>));
      return {
        campaigns,
        total: campaigns.length,
      };
    });
  }

  async pauseCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.action(id, { action: 'pause' });
      return {
        success: res.status === 'success' || res.current_status === 'paused',
        status: res.current_status || 'paused',
      };
    });
  }

  async resumeCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.action(id, { action: 'resume' });
      return {
        success: res.status === 'success' || res.current_status === 'in_progress',
        status: res.current_status || 'in_progress',
      };
    });
  }

  async cancelCampaign(providerCampaignId: string): Promise<{ success: boolean; status: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.cancel(id);
      return {
        success: res.status === 'success' || res.current_status === 'cancelled',
        status: res.current_status || 'cancelled',
      };
    });
  }

  async getCampaignLiveStatus(providerCampaignId: string): Promise<CampaignLiveStatus> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.liveStatus(id);
      return mapSdkCampaignLiveStatus(res as Record<string, unknown>);
    });
  }

  async listCampaignLines(providerCampaignId: string, query?: ListCampaignLinesQuery): Promise<CampaignLinesResult> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const q: Record<string, unknown> = {};
      if (query?.cursor) q.cursor = query.cursor;
      if (query?.pageSize) q.pagesize = query.pageSize;
      if (query?.status) q.call_status = query.status;
      if (query?.search) q.search = query.search;
      if (query?.includeTotal) q.include_total = true;

      const res = await client.bulkCalls.listLines(
        id,
        q as unknown as Parameters<typeof client.bulkCalls.listLines>[1]
      );

      const records = (res.records || []).map((l) =>
        mapSdkCampaignLineToNormalized(l as Record<string, unknown>)
      );

      return {
        records,
        hasMore: Boolean(res.has_more),
        nextCursor: res.next_cursor || null,
        totalRecords: res.total_records,
        pageSize: res.pagesize,
      };
    });
  }

  async addCampaignContacts(input: AddContactsInput): Promise<AddContactsResult> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(input.campaignId) || input.campaignId;
      const contactsPayload = input.contacts.map((c) => ({
        to_number: c.toNumber,
        custom_variables: c.customVariables,
        metadata: c.metadata,
      }));

      const res = await client.bulkCalls.addContacts(id, {
        contacts: contactsPayload,
      });

      return {
        addedCount: res.added_count ?? (res.added ? res.added.length : 0),
        rejectedCount: res.rejected_count ?? (res.rejected ? res.rejected.length : 0),
        added: (res.added || []).map((a) => ({ lineId: a.line_id, toNumber: a.to_number })),
        rejected: (res.rejected || []).map((r) => ({ index: r.index, reason: r.reason })),
        campaignId: res.campaign_id,
        campaignStatus: res.campaign_status,
      };
    });
  }

  async setCampaignConcurrency(providerCampaignId: string, input: SetConcurrencyInput): Promise<{ success: boolean; concurrentCallLimit: number }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.setConcurrency(id, {
        concurrent_call_limit: input.concurrentCallLimit,
      });

      return {
        success: res.status === 'success' || Boolean(res.concurrent_call_limit),
        concurrentCallLimit: res.concurrent_call_limit ?? input.concurrentCallLimit,
      };
    });
  }

  async setCampaignDailyTimeControl(providerCampaignId: string, input: SetDailyTimeControlInput): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const payload: Record<string, unknown> = {
        enable_daily_hard_stop: input.enableDailyHardStop,
        enable_daily_auto_start: input.enableDailyAutoStart,
      };

      if (input.dailyStopTime !== undefined) payload.daily_stop_time = input.dailyStopTime;
      if (input.dailyStopTimezone) payload.daily_stop_timezone = input.dailyStopTimezone;
      if (input.dailyStartTime !== undefined) payload.daily_start_time = input.dailyStartTime;
      if (input.dailyStartTimezone) payload.daily_start_timezone = input.dailyStartTimezone;

      await client.bulkCalls.setDailyTimeControl(
        id,
        payload as unknown as Parameters<typeof client.bulkCalls.setDailyTimeControl>[1]
      );

      return { success: true };
    });
  }

  async retryCampaign(providerCampaignId: string, input?: RetryCampaignInput): Promise<{ success: boolean; message?: string }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const payload: Record<string, unknown> = {};
      if (input?.retryStrategy) payload.retry_strategy = input.retryStrategy;
      if (input?.maxRetries !== undefined) payload.max_retries = input.maxRetries;
      if (input?.failureReasons && input.failureReasons.length > 0) payload.failure_reasons = input.failureReasons;

      const res = await client.bulkCalls.retry(
        id,
        payload as unknown as Parameters<typeof client.bulkCalls.retry>[1]
      );

      return {
        success: res.status === 'success' || !res.status,
        message: res.message,
      };
    });
  }

  async listCampaignNumbers(providerCampaignId: string): Promise<CampaignNumberPoolItem[]> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      const res = await client.bulkCalls.listNumbers(id);
      return (res.numbers || []).map((n) => mapSdkCampaignPoolNumber(n as Record<string, unknown>));
    });
  }

  async addCampaignNumber(providerCampaignId: string, phoneNumberId: string | number): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const id = Number(providerCampaignId) || providerCampaignId;
      await client.bulkCalls.addNumber(id, {
        phone_number_id: Number(phoneNumberId) || (phoneNumberId as unknown as number),
      });
      return { success: true };
    });
  }

  async setCampaignNumberActive(providerCampaignId: string, assignmentId: string | number, isActive: boolean): Promise<{ success: boolean }> {
    return withOmniDimension(this.apiKey, async (client) => {
      const cId = Number(providerCampaignId) || providerCampaignId;
      const aId = Number(assignmentId) || assignmentId;
      await client.bulkCalls.setNumberActive(cId, aId, {
        is_active: isActive,
      });
      return { success: true };
    });
  }
}
