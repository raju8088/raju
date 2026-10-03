import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { UsageEvent } from '@/types/billing';

export class UsageEventRepository {
  async create(
    input: {
      id?: string;
      organizationId: string;
      provider?: string;
      providerCallId?: string | null;
      callId?: string | null;
      campaignId?: string | null;
      leadId?: string | null;
      usageType?: string;
      quantity: number;
      unit?: string;
      durationSeconds: number;
      source?: string;
      idempotencyKey: string;
      eventTime?: string;
    },
    client?: QueryClient
  ): Promise<UsageEvent> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO usage_events (
        id, organization_id, provider, provider_call_id,
        call_id, campaign_id, lead_id, usage_type,
        quantity, unit, duration_seconds, source,
        event_time, idempotency_key, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<UsageEvent>(sql, [
      id,
      input.organizationId,
      input.provider || 'OMNIDIMENSION',
      input.providerCallId || null,
      input.callId || null,
      input.campaignId || null,
      input.leadId || null,
      input.usageType || 'VOICE_MINUTE',
      input.quantity,
      input.unit || 'MINUTE',
      input.durationSeconds,
      input.source || 'PROVIDER_COMPLETED',
      input.eventTime || new Date().toISOString(),
      input.idempotencyKey,
    ]);

    if (!row) throw new Error('Failed to create usage event');
    return row;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: QueryClient
  ): Promise<UsageEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM usage_events
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1;
    `;
    return db.queryOne<UsageEvent>(sql, [organizationId, idempotencyKey]);
  }

  async findByProviderCallId(
    organizationId: string,
    provider: string,
    providerCallId: string,
    client?: QueryClient
  ): Promise<UsageEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM usage_events
      WHERE organization_id = $1 AND provider = $2 AND provider_call_id = $3
      LIMIT 1;
    `;
    return db.queryOne<UsageEvent>(sql, [organizationId, provider, providerCallId]);
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<{ events: UsageEvent[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const countSql = `SELECT COUNT(*) as count FROM usage_events WHERE organization_id = $1;`;
    const listSql = `
      SELECT * FROM usage_events
      WHERE organization_id = $1
      ORDER BY event_time DESC
      LIMIT $2 OFFSET $3;
    `;

    const [countRes, events] = await Promise.all([
      db.queryOne<{ count: string | number }>(countSql, [organizationId]),
      db.query<UsageEvent>(listSql, [organizationId, limit, offset]),
    ]);

    return {
      events,
      total: Number(countRes?.count || 0),
    };
  }
}

export const usageEventRepository = new UsageEventRepository();
