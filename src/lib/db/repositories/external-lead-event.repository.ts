import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { ExternalLeadEvent, ExternalLeadEventStatus } from '@/types/crm';

export interface CreateExternalLeadEventInput {
  id?: string;
  organizationId: string;
  provider: string;
  providerEventId: string;
  externalLeadId?: string | null;
  eventHash?: string | null;
  processingStatus?: ExternalLeadEventStatus;
  leadId?: string | null;
  errorMessageSafe?: string | null;
}

export class ExternalLeadEventRepository {
  async create(
    input: CreateExternalLeadEventInput,
    client?: QueryClient
  ): Promise<ExternalLeadEvent> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const status = input.processingStatus || 'RECEIVED';

    const sql = `
      INSERT INTO external_lead_events (
        id, organization_id, provider, provider_event_id,
        external_lead_id, event_hash, processing_status,
        lead_id, error_message_safe, received_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<ExternalLeadEvent>(sql, [
      id,
      input.organizationId,
      input.provider,
      input.providerEventId,
      input.externalLeadId || null,
      input.eventHash || null,
      status,
      input.leadId || null,
      input.errorMessageSafe || null,
    ]);

    if (!row) {
      throw new Error('Failed to record external lead event');
    }

    return row;
  }

  async findByProviderEventId(
    organizationId: string,
    provider: string,
    providerEventId: string,
    client?: QueryClient
  ): Promise<ExternalLeadEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM external_lead_events
      WHERE organization_id = $1 AND provider = $2 AND provider_event_id = $3
      LIMIT 1;
    `;

    return db.queryOne<ExternalLeadEvent>(sql, [organizationId, provider, providerEventId]);
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: ExternalLeadEventStatus,
    details?: { leadId?: string; errorMessage?: string },
    client?: QueryClient
  ): Promise<ExternalLeadEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const fields: string[] = ['processing_status = $3'];
    const values: unknown[] = [id, organizationId, status];
    let idx = 4;

    if (status === 'PROCESSED' || status === 'FAILED' || status === 'DUPLICATE') {
      fields.push('processed_at = NOW()');
    }

    if (details?.leadId !== undefined) {
      fields.push(`lead_id = $${idx++}`);
      values.push(details.leadId);
    }

    if (details?.errorMessage !== undefined) {
      fields.push(`error_message_safe = $${idx++}`);
      values.push(details.errorMessage);
    }

    const sql = `
      UPDATE external_lead_events
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;

    return db.queryOne<ExternalLeadEvent>(sql, values);
  }
}

export const externalLeadEventRepository = new ExternalLeadEventRepository();
