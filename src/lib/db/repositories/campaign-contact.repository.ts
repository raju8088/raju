import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export interface CampaignContactRecord {
  id: string;
  organization_id: string;
  campaign_id: string;
  provider_line_id: string | null;
  phone_number: string;
  normalized_phone_number: string;
  custom_variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  failure_reason: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
  provider_call_id: string | null;
  call_id: string | null;
  lead_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignContactInput {
  id?: string;
  organizationId: string;
  campaignId: string;
  providerLineId?: string | null;
  phoneNumber: string;
  normalizedPhoneNumber: string;
  customVariables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  leadId?: string | null;
  status?: string;
}

export interface UpdateCampaignContactInput {
  providerLineId?: string | null;
  status?: string;
  failureReason?: string | null;
  attemptCount?: number;
  lastAttemptAt?: Date | string | null;
  completedAt?: Date | string | null;
  durationSeconds?: number;
  providerCallId?: string | null;
  callId?: string | null;
}

export class CampaignContactRepository {
  async create(
    contact: CreateCampaignContactInput,
    client?: QueryClient
  ): Promise<CampaignContactRecord> {
    const results = await this.bulkCreate([contact], client);
    if (results.length === 0) throw new Error('Failed to create campaign contact');
    return results[0];
  }

  async bulkCreate(
    contacts: CreateCampaignContactInput[],
    client?: QueryClient
  ): Promise<CampaignContactRecord[]> {
    if (contacts.length === 0) return [];
    const db = client || (await ensureDatabaseReady());

    const results: CampaignContactRecord[] = [];

    // Chunk in batches of 200 for database insertion safely
    const chunkSize = 200;
    for (let i = 0; i < contacts.length; i += chunkSize) {
      const chunk = contacts.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const valueTuples: string[] = [];
      let paramIdx = 1;

      for (const c of chunk) {
        const id = c.id || generateUUID();
        const customVars = JSON.stringify(c.customVariables || {});
        const meta = JSON.stringify(c.metadata || {});
        const status = c.status || 'PENDING';

        valueTuples.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`
        );
        values.push(
          id,
          c.organizationId,
          c.campaignId,
          c.providerLineId || null,
          c.phoneNumber,
          c.normalizedPhoneNumber,
          customVars,
          meta,
          status,
          c.leadId || null
        );
      }

      const rows = await db.query<CampaignContactRecord>(
        `INSERT INTO campaign_contacts (
          id, organization_id, campaign_id, provider_line_id,
          phone_number, normalized_phone_number, custom_variables,
          metadata, status, lead_id, created_at, updated_at
        ) VALUES ${valueTuples.join(', ')}
        ON CONFLICT (campaign_id, normalized_phone_number) DO UPDATE SET
          lead_id = COALESCE(EXCLUDED.lead_id, campaign_contacts.lead_id),
          custom_variables = EXCLUDED.custom_variables,
          metadata = EXCLUDED.metadata,
          provider_line_id = COALESCE(EXCLUDED.provider_line_id, campaign_contacts.provider_line_id),
          updated_at = NOW()
        RETURNING *;`,
        values
      );

      results.push(...rows);
    }

    return results;
  }

  async findById(
    id: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CampaignContactRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<CampaignContactRecord>(
      `SELECT * FROM campaign_contacts WHERE id = $1 AND organization_id = $2;`,
      [id, organizationId]
    );
  }

  async findByCampaignId(
    campaignId: string,
    organizationId: string,
    options?: { status?: string; search?: string; limit?: number; offset?: number },
    client?: QueryClient
  ): Promise<CampaignContactRecord[]> {
    const db = client || (await ensureDatabaseReady());
    const conditions = ['campaign_id = $1', 'organization_id = $2'];
    const values: unknown[] = [campaignId, organizationId];
    let idx = 3;

    if (options?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(options.status.toUpperCase());
    }

    if (options?.search) {
      conditions.push(`(phone_number ILIKE $${idx} OR normalized_phone_number ILIKE $${idx})`);
      values.push(`%${options.search}%`);
      idx++;
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    values.push(limit, offset);

    return db.query<CampaignContactRecord>(
      `SELECT * FROM campaign_contacts
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC
       LIMIT $${idx++} OFFSET $${idx++};`,
      values
    );
  }

  async countByCampaignId(
    campaignId: string,
    organizationId: string,
    options?: { status?: string; search?: string },
    client?: QueryClient
  ): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    const conditions = ['campaign_id = $1', 'organization_id = $2'];
    const values: unknown[] = [campaignId, organizationId];
    let idx = 3;

    if (options?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(options.status.toUpperCase());
    }

    if (options?.search) {
      conditions.push(`(phone_number ILIKE $${idx} OR normalized_phone_number ILIKE $${idx})`);
      values.push(`%${options.search}%`);
      idx++;
    }

    const row = await db.queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM campaign_contacts WHERE ${conditions.join(' AND ')};`,
      values
    );
    return row ? Number(row.count) : 0;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    input: UpdateCampaignContactInput,
    client?: QueryClient
  ): Promise<CampaignContactRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const updates: string[] = [];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(input.status.toUpperCase());
    }
    if (input.failureReason !== undefined) {
      updates.push(`failure_reason = $${idx++}`);
      values.push(input.failureReason);
    }
    if (input.attemptCount !== undefined) {
      updates.push(`attempt_count = $${idx++}`);
      values.push(input.attemptCount);
    }
    if (input.lastAttemptAt !== undefined) {
      updates.push(`last_attempt_at = $${idx++}`);
      values.push(input.lastAttemptAt ? new Date(input.lastAttemptAt).toISOString() : null);
    }
    if (input.completedAt !== undefined) {
      updates.push(`completed_at = $${idx++}`);
      values.push(input.completedAt ? new Date(input.completedAt).toISOString() : null);
    }
    if (input.durationSeconds !== undefined) {
      updates.push(`duration_seconds = $${idx++}`);
      values.push(input.durationSeconds);
    }
    if (input.providerCallId !== undefined) {
      updates.push(`provider_call_id = $${idx++}`);
      values.push(input.providerCallId);
    }
    if (input.callId !== undefined) {
      updates.push(`call_id = $${idx++}`);
      values.push(input.callId);
    }
    if (input.providerLineId !== undefined) {
      updates.push(`provider_line_id = $${idx++}`);
      values.push(input.providerLineId);
    }

    if (updates.length === 0) {
      return this.findById(id, organizationId, client);
    }

    updates.push('updated_at = NOW()');

    return db.queryOne<CampaignContactRecord>(
      `UPDATE campaign_contacts
       SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *;`,
      values
    );
  }

  async updateByProviderLineId(
    campaignId: string,
    providerLineId: string,
    input: UpdateCampaignContactInput,
    client?: QueryClient
  ): Promise<CampaignContactRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const updates: string[] = [];
    const values: unknown[] = [campaignId, providerLineId];
    let idx = 3;

    if (input.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(input.status.toUpperCase());
    }
    if (input.failureReason !== undefined) {
      updates.push(`failure_reason = $${idx++}`);
      values.push(input.failureReason);
    }
    if (input.attemptCount !== undefined) {
      updates.push(`attempt_count = $${idx++}`);
      values.push(input.attemptCount);
    }
    if (input.lastAttemptAt !== undefined) {
      updates.push(`last_attempt_at = $${idx++}`);
      values.push(input.lastAttemptAt ? new Date(input.lastAttemptAt).toISOString() : null);
    }
    if (input.completedAt !== undefined) {
      updates.push(`completed_at = $${idx++}`);
      values.push(input.completedAt ? new Date(input.completedAt).toISOString() : null);
    }
    if (input.durationSeconds !== undefined) {
      updates.push(`duration_seconds = $${idx++}`);
      values.push(input.durationSeconds);
    }
    if (input.providerCallId !== undefined) {
      updates.push(`provider_call_id = $${idx++}`);
      values.push(input.providerCallId);
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = NOW()');

    return db.queryOne<CampaignContactRecord>(
      `UPDATE campaign_contacts
       SET ${updates.join(', ')}
       WHERE campaign_id = $1 AND provider_line_id = $2
       RETURNING *;`,
      values
    );
  }

  async getStats(
    campaignId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    busy: number;
    noAnswer: number;
    avgDurationSec: number;
  }> {
    const db = client || (await ensureDatabaseReady());
    const rows = await db.query<{ status: string; count: string | number; avg_duration: string | number }>(
      `SELECT status, COUNT(*) as count, AVG(duration_seconds) as avg_duration
       FROM campaign_contacts
       WHERE campaign_id = $1 AND organization_id = $2
       GROUP BY status;`,
      [campaignId, organizationId]
    );

    let total = 0;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let failed = 0;
    let busy = 0;
    let noAnswer = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const r of rows) {
      const c = Number(r.count);
      total += c;
      const s = r.status.toUpperCase();
      if (s === 'PENDING' || s === 'QUEUED') pending += c;
      else if (s === 'IN_PROGRESS') inProgress += c;
      else if (s === 'COMPLETED') {
        completed += c;
        if (r.avg_duration) {
          totalDuration += Number(r.avg_duration) * c;
          durationCount += c;
        }
      } else if (s === 'FAILED') failed += c;
      else if (s === 'BUSY') busy += c;
      else if (s === 'NO_ANSWER') noAnswer += c;
    }

    const avgDurationSec = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    return {
      total,
      pending,
      inProgress,
      completed,
      failed,
      busy,
      noAnswer,
      avgDurationSec,
    };
  }

  async listAllForExport(
    campaignId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CampaignContactRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<CampaignContactRecord>(
      `SELECT * FROM campaign_contacts
       WHERE campaign_id = $1 AND organization_id = $2
       ORDER BY created_at ASC;`,
      [campaignId, organizationId]
    );
  }

  async findByLeadId(
    leadId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CampaignContactRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<CampaignContactRecord>(
      `SELECT cc.*, c.name as campaign_name, c.status as campaign_status
       FROM campaign_contacts cc
       JOIN campaigns c ON c.id = cc.campaign_id
       WHERE (cc.lead_id::text = $1 OR cc.metadata->>'lead_id' = $1) AND cc.organization_id = $2
       ORDER BY cc.created_at DESC;`,
      [leadId, organizationId]
    );
  }
}

export const campaignContactRepository = new CampaignContactRepository();
