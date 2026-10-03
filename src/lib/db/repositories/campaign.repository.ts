import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export interface CampaignRecord {
  id: string;
  organization_id: string;
  provider: string;
  provider_campaign_id: string | null;
  name: string;
  description: string | null;
  agent_id: string;
  provider_agent_id: string;
  phone_number_id: string;
  provider_phone_number_id: string;
  status: string;
  timezone: string;
  concurrency: number;
  retry_policy: {
    auto_retry?: boolean;
    auto_retry_schedule?: string;
    retry_schedule_days?: number;
    retry_schedule_hours?: number;
    retry_limit?: number;
  };
  calling_window: {
    enabled: boolean;
    start_time?: number;
    stop_time?: number;
    timezone?: string;
  };
  rotation_config: Record<string, unknown>;
  created_by: string | null;
  total_contacts: number;
  completed_contacts: number;
  failed_contacts: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields for display
  agent_name?: string;
  phone_number_display?: string;
}

export interface CreateCampaignRecordInput {
  id?: string;
  organizationId: string;
  provider?: string;
  providerCampaignId?: string | null;
  name: string;
  description?: string | null;
  agentId: string;
  providerAgentId: string;
  phoneNumberId: string;
  providerPhoneNumberId: string;
  status?: string;
  timezone?: string;
  concurrency?: number;
  retryPolicy?: Record<string, unknown>;
  callingWindow?: Record<string, unknown>;
  rotationConfig?: Record<string, unknown>;
  createdBy?: string | null;
  totalContacts?: number;
}

export interface UpdateCampaignRecordInput {
  name?: string;
  description?: string | null;
  providerCampaignId?: string | null;
  status?: string;
  concurrency?: number;
  retryPolicy?: Record<string, unknown>;
  callingWindow?: Record<string, unknown>;
  rotationConfig?: Record<string, unknown>;
  startedAt?: Date | string | null;
  pausedAt?: Date | string | null;
  completedAt?: Date | string | null;
}

export class CampaignRepository {
  async findById(
    id: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CampaignRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<CampaignRecord>(
      `SELECT 
        c.*,
        a.name as agent_name,
        p.phone_number as phone_number_display
       FROM campaigns c
       LEFT JOIN voice_agents a ON a.id = c.agent_id
       LEFT JOIN phone_numbers p ON p.id = c.phone_number_id
       WHERE c.id = $1 AND c.organization_id = $2;`,
      [id, organizationId]
    );
  }

  async findByProviderCampaignId(
    organizationId: string,
    providerCampaignId: string,
    client?: QueryClient
  ): Promise<CampaignRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<CampaignRecord>(
      `SELECT 
        c.*,
        a.name as agent_name,
        p.phone_number as phone_number_display
       FROM campaigns c
       LEFT JOIN voice_agents a ON a.id = c.agent_id
       LEFT JOIN phone_numbers p ON p.id = c.phone_number_id
       WHERE c.organization_id = $1 AND c.provider_campaign_id = $2;`,
      [organizationId, providerCampaignId]
    );
  }

  async create(
    input: CreateCampaignRecordInput,
    client?: QueryClient
  ): Promise<CampaignRecord> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const provider = input.provider || 'OMNIDIMENSION';
    const status = input.status || 'DRAFT';
    const timezone = input.timezone || 'UTC';
    const concurrency = input.concurrency ?? 1;
    const retryPolicy = JSON.stringify(input.retryPolicy || { auto_retry: false, retry_limit: 1 });
    const callingWindow = JSON.stringify(input.callingWindow || { enabled: false });
    const rotationConfig = JSON.stringify(input.rotationConfig || {});
    const totalContacts = input.totalContacts ?? 0;

    const row = await db.queryOne<CampaignRecord>(
      `INSERT INTO campaigns (
        id, organization_id, provider, provider_campaign_id, name, description,
        agent_id, provider_agent_id, phone_number_id, provider_phone_number_id,
        status, timezone, concurrency, retry_policy, calling_window, rotation_config,
        created_by, total_contacts, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, NOW(), NOW()
      ) RETURNING *;`,
      [
        id,
        input.organizationId,
        provider,
        input.providerCampaignId || null,
        input.name,
        input.description || null,
        input.agentId,
        input.providerAgentId,
        input.phoneNumberId,
        input.providerPhoneNumberId,
        status,
        timezone,
        concurrency,
        retryPolicy,
        callingWindow,
        rotationConfig,
        input.createdBy || null,
        totalContacts,
      ]
    );

    if (!row) {
      throw new Error('Failed to create campaign record in database.');
    }
    return row;
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateCampaignRecordInput,
    client?: QueryClient
  ): Promise<CampaignRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const updates: string[] = [];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.providerCampaignId !== undefined) {
      updates.push(`provider_campaign_id = $${idx++}`);
      values.push(input.providerCampaignId);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(input.status);
    }
    if (input.concurrency !== undefined) {
      updates.push(`concurrency = $${idx++}`);
      values.push(input.concurrency);
    }
    if (input.retryPolicy !== undefined) {
      updates.push(`retry_policy = $${idx++}`);
      values.push(JSON.stringify(input.retryPolicy));
    }
    if (input.callingWindow !== undefined) {
      updates.push(`calling_window = $${idx++}`);
      values.push(JSON.stringify(input.callingWindow));
    }
    if (input.rotationConfig !== undefined) {
      updates.push(`rotation_config = $${idx++}`);
      values.push(JSON.stringify(input.rotationConfig));
    }
    if (input.startedAt !== undefined) {
      updates.push(`started_at = $${idx++}`);
      values.push(input.startedAt ? new Date(input.startedAt).toISOString() : null);
    }
    if (input.pausedAt !== undefined) {
      updates.push(`paused_at = $${idx++}`);
      values.push(input.pausedAt ? new Date(input.pausedAt).toISOString() : null);
    }
    if (input.completedAt !== undefined) {
      updates.push(`completed_at = $${idx++}`);
      values.push(input.completedAt ? new Date(input.completedAt).toISOString() : null);
    }

    if (updates.length === 0) {
      return this.findById(id, organizationId, client);
    }

    updates.push('updated_at = NOW()');

    return db.queryOne<CampaignRecord>(
      `UPDATE campaigns 
       SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *;`,
      values
    );
  }

  async updateCounters(
    id: string,
    organizationId: string,
    counters: { total?: number; completed?: number; failed?: number },
    client?: QueryClient
  ): Promise<void> {
    const db = client || (await ensureDatabaseReady());
    const updates: string[] = [];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (counters.total !== undefined) {
      updates.push(`total_contacts = $${idx++}`);
      values.push(counters.total);
    }
    if (counters.completed !== undefined) {
      updates.push(`completed_contacts = $${idx++}`);
      values.push(counters.completed);
    }
    if (counters.failed !== undefined) {
      updates.push(`failed_contacts = $${idx++}`);
      values.push(counters.failed);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = NOW()');
    await db.query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2;`,
      values
    );
  }

  async listByOrganizationId(
    organizationId: string,
    options?: { status?: string; search?: string; limit?: number; offset?: number },
    client?: QueryClient
  ): Promise<CampaignRecord[]> {
    const db = client || (await ensureDatabaseReady());
    const conditions = ['c.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (options?.status) {
      conditions.push(`c.status = $${idx++}`);
      values.push(options.status.toUpperCase());
    }

    if (options?.search) {
      conditions.push(`c.name ILIKE $${idx++}`);
      values.push(`%${options.search}%`);
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    values.push(limit, offset);

    return db.query<CampaignRecord>(
      `SELECT 
        c.*,
        a.name as agent_name,
        p.phone_number as phone_number_display
       FROM campaigns c
       LEFT JOIN voice_agents a ON a.id = c.agent_id
       LEFT JOIN phone_numbers p ON p.id = c.phone_number_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++};`,
      values
    );
  }

  async countByOrganizationId(
    organizationId: string,
    options?: { status?: string; search?: string },
    client?: QueryClient
  ): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    const conditions = ['organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (options?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(options.status.toUpperCase());
    }

    if (options?.search) {
      conditions.push(`name ILIKE $${idx++}`);
      values.push(`%${options.search}%`);
    }

    const row = await db.queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM campaigns WHERE ${conditions.join(' AND ')};`,
      values
    );
    return row ? Number(row.count) : 0;
  }

  async delete(
    id: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM campaigns WHERE id = $1 AND organization_id = $2;`,
      [id, organizationId]
    );
    return res !== null;
  }
}

export const campaignRepository = new CampaignRepository();
