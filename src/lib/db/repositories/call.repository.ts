import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export interface CallRecord {
  id: string;
  organization_id: string;
  provider: string;
  provider_call_id: string | null;
  provider_request_id: string | null;
  agent_id: string | null;
  provider_agent_id: string;
  phone_number_id: string | null;
  provider_phone_number_id: string | null;
  direction: 'inbound' | 'outbound';
  destination_number: string;
  source_number: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  duration_source: string;
  recording_url: string | null;
  recording_available: boolean;
  summary: string | null;
  sentiment: string | null;
  sentiment_details: string | null;
  extracted_variables: Record<string, unknown>;
  transcript: string | null;
  call_context: Record<string, unknown>;
  metadata: Record<string, unknown>;
  lead_id?: string | null;
  idempotency_key: string | null;
  last_provider_sync_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  agent_name?: string;
  phone_number_display?: string;
}

export interface CreateCallInput {
  id?: string;
  organizationId: string;
  provider?: string;
  providerCallId?: string | null;
  providerRequestId?: string | null;
  agentId?: string | null;
  providerAgentId: string;
  phoneNumberId?: string | null;
  providerPhoneNumberId?: string | null;
  direction?: 'inbound' | 'outbound';
  destinationNumber: string;
  sourceNumber?: string | null;
  status?: string;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  durationSeconds?: number;
  durationSource?: string;
  recordingUrl?: string | null;
  recordingAvailable?: boolean;
  summary?: string | null;
  sentiment?: string | null;
  sentimentDetails?: string | null;
  extractedVariables?: Record<string, unknown>;
  transcript?: string | null;
  callContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  leadId?: string | null;
  idempotencyKey?: string | null;
}

export interface CallListFilters {
  page?: number;
  limit?: number;
  status?: string;
  agentId?: string;
  phoneNumberId?: string;
  direction?: 'inbound' | 'outbound';
  destinationSearch?: string;
  startDate?: string;
  endDate?: string;
}

export class CallRepository {
  async create(input: CreateCallInput, client?: QueryClient): Promise<CallRecord> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const provider = input.provider || 'OMNIDIMENSION';
    const direction = input.direction || 'outbound';
    const status = input.status || 'QUEUED';
    const durationSeconds = input.durationSeconds ?? 0;
    const durationSource = input.durationSource || 'UNKNOWN';
    const recordingAvailable = Boolean(input.recordingAvailable ?? (input.recordingUrl ? true : false));

    const leadId = input.leadId || (input.metadata?.lead_id as string) || null;

    const sql = `
      INSERT INTO calls (
        id, organization_id, provider, provider_call_id, provider_request_id,
        agent_id, provider_agent_id, phone_number_id, provider_phone_number_id,
        direction, destination_number, source_number, status, started_at, ended_at,
        duration_seconds, duration_source, recording_url, recording_available,
        summary, sentiment, sentiment_details, extracted_variables, transcript,
        call_context, metadata, idempotency_key, lead_id, last_provider_sync_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23, $24,
        $25, $26, $27, $28, NOW(), NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<CallRecord>(sql, [
      id,
      input.organizationId,
      provider,
      input.providerCallId || null,
      input.providerRequestId || null,
      input.agentId || null,
      input.providerAgentId,
      input.phoneNumberId || null,
      input.providerPhoneNumberId || null,
      direction,
      input.destinationNumber,
      input.sourceNumber || null,
      status,
      input.startedAt ? new Date(input.startedAt).toISOString() : null,
      input.endedAt ? new Date(input.endedAt).toISOString() : null,
      durationSeconds,
      durationSource,
      input.recordingUrl || null,
      recordingAvailable,
      input.summary || null,
      input.sentiment || null,
      input.sentimentDetails || null,
      JSON.stringify(input.extractedVariables || {}),
      input.transcript || null,
      JSON.stringify(input.callContext || {}),
      JSON.stringify(input.metadata || {}),
      input.idempotencyKey || null,
      leadId,
    ]);

    if (!row) {
      throw new Error('Failed to create call record');
    }

    return row;
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<CallRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.id = $1 ${organizationId ? 'AND c.organization_id = $2' : ''};
    `;
    const params = organizationId ? [id, organizationId] : [id];
    return db.queryOne<CallRecord>(sql, params);
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: QueryClient
  ): Promise<CallRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.organization_id = $1 AND c.idempotency_key = $2;
    `;
    return db.queryOne<CallRecord>(sql, [organizationId, idempotencyKey]);
  }

  async findByProviderCallId(
    providerCallId: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<CallRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.provider_call_id = $1 ${organizationId ? 'AND c.organization_id = $2' : ''};
    `;
    const params = organizationId ? [providerCallId, organizationId] : [providerCallId];
    return db.queryOne<CallRecord>(sql, params);
  }

  async findByProviderRequestId(
    providerRequestId: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<CallRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.provider_request_id = $1 ${organizationId ? 'AND c.organization_id = $2' : ''};
    `;
    const params = organizationId ? [providerRequestId, organizationId] : [providerRequestId];
    return db.queryOne<CallRecord>(sql, params);
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<CallRecord>,
    client?: QueryClient
  ): Promise<CallRecord> {
    const db = client || (await ensureDatabaseReady());
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.provider_call_id !== undefined) {
      sets.push(`provider_call_id = $${idx++}`);
      values.push(data.provider_call_id);
    }
    if (data.provider_request_id !== undefined) {
      sets.push(`provider_request_id = $${idx++}`);
      values.push(data.provider_request_id);
    }
    if (data.started_at !== undefined) {
      sets.push(`started_at = $${idx++}`);
      values.push(data.started_at);
    }
    if (data.ended_at !== undefined) {
      sets.push(`ended_at = $${idx++}`);
      values.push(data.ended_at);
    }
    if (data.duration_seconds !== undefined) {
      sets.push(`duration_seconds = $${idx++}`);
      values.push(data.duration_seconds);
    }
    if (data.duration_source !== undefined) {
      sets.push(`duration_source = $${idx++}`);
      values.push(data.duration_source);
    }
    if (data.recording_url !== undefined) {
      sets.push(`recording_url = $${idx++}`);
      values.push(data.recording_url);
      sets.push(`recording_available = $${idx++}`);
      values.push(Boolean(data.recording_url));
    }
    if (data.summary !== undefined) {
      sets.push(`summary = $${idx++}`);
      values.push(data.summary);
    }
    if (data.sentiment !== undefined) {
      sets.push(`sentiment = $${idx++}`);
      values.push(data.sentiment);
    }
    if (data.sentiment_details !== undefined) {
      sets.push(`sentiment_details = $${idx++}`);
      values.push(data.sentiment_details);
    }
    if (data.extracted_variables !== undefined) {
      sets.push(`extracted_variables = $${idx++}`);
      values.push(JSON.stringify(data.extracted_variables));
    }
    if (data.transcript !== undefined) {
      sets.push(`transcript = $${idx++}`);
      values.push(data.transcript);
    }
    if (data.metadata !== undefined) {
      sets.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(data.metadata));
    }
    if (data.last_provider_sync_at !== undefined) {
      sets.push(`last_provider_sync_at = $${idx++}`);
      values.push(data.last_provider_sync_at);
    }

    const sql = `
      UPDATE calls
      SET ${sets.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;

    const row = await db.queryOne<CallRecord>(sql, values);
    if (!row) {
      throw new Error('Call record not found or update failed');
    }
    return row;
  }

  async list(
    organizationId: string,
    filters: CallListFilters = {},
    client?: QueryClient
  ): Promise<{ calls: CallRecord[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const conditions: string[] = ['c.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`c.status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.agentId) {
      conditions.push(`c.agent_id = $${idx++}`);
      values.push(filters.agentId);
    }
    if (filters.phoneNumberId) {
      conditions.push(`c.phone_number_id = $${idx++}`);
      values.push(filters.phoneNumberId);
    }
    if (filters.direction) {
      conditions.push(`c.direction = $${idx++}`);
      values.push(filters.direction);
    }
    if (filters.destinationSearch) {
      conditions.push(`c.destination_number LIKE $${idx++}`);
      values.push(`%${filters.destinationSearch}%`);
    }
    if (filters.startDate) {
      conditions.push(`c.created_at >= $${idx++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`c.created_at <= $${idx++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.join(' AND ');
    const countSql = `SELECT COUNT(*) as count FROM calls c WHERE ${whereClause};`;
    const countRow = await db.queryOne<{ count: string | number }>(countSql, values);
    const total = Number(countRow?.count || 0);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const listSql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;

    values.push(limit, offset);
    const calls = await db.query<CallRecord>(listSql, values);

    return { calls, total };
  }

  async findByLeadId(
    leadId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CallRecord[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT c.*, va.name as agent_name, pn.phone_number as phone_number_display
      FROM calls c
      LEFT JOIN voice_agents va ON va.id = c.agent_id
      LEFT JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE (c.lead_id::text = $1 OR c.metadata->>'lead_id' = $1) AND c.organization_id = $2
      ORDER BY c.created_at DESC;
    `;
    return db.query<CallRecord>(sql, [leadId, organizationId]);
  }
}

export const callRepository = new CallRepository();
