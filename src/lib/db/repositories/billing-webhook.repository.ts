import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingWebhookEvent, WebhookProcessingStatus } from '@/types/billing';

export class BillingWebhookRepository {
  async create(
    input: {
      id?: string;
      provider?: string;
      providerEventId: string;
      eventType: string;
      signatureVerified?: boolean;
      processingStatus?: WebhookProcessingStatus;
      payloadHash?: string | null;
      errorMessageSafe?: string | null;
    },
    client?: QueryClient
  ): Promise<BillingWebhookEvent> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_webhook_events (
        id, provider, provider_event_id, event_type,
        signature_verified, processing_status, payload_hash,
        error_message_safe, received_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, NOW()
      )
      ON CONFLICT (provider, provider_event_id) DO UPDATE SET
        processing_status = EXCLUDED.processing_status
      RETURNING *;
    `;

    const row = await db.queryOne<BillingWebhookEvent>(sql, [
      id,
      input.provider || 'RAZORPAY',
      input.providerEventId,
      input.eventType,
      input.signatureVerified ?? false,
      input.processingStatus || 'RECEIVED',
      input.payloadHash || null,
      input.errorMessageSafe || null,
    ]);

    if (!row) throw new Error('Failed to create webhook event log');
    return row;
  }

  async findByProviderEventId(
    provider: string,
    providerEventId: string,
    client?: QueryClient
  ): Promise<BillingWebhookEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM billing_webhook_events
      WHERE provider = $1 AND provider_event_id = $2
      LIMIT 1;
    `;
    return db.queryOne<BillingWebhookEvent>(sql, [provider, providerEventId]);
  }

  async updateStatus(
    id: string,
    status: WebhookProcessingStatus,
    errorMessageSafe?: string | null,
    client?: QueryClient
  ): Promise<BillingWebhookEvent | null> {
    const db = client || (await ensureDatabaseReady());
    const isTerminal = status === 'PROCESSED' || status === 'FAILED';
    const sql = isTerminal
      ? `UPDATE billing_webhook_events SET processing_status = $1, error_message_safe = COALESCE($2, error_message_safe), processed_at = NOW() WHERE id = $3 RETURNING *;`
      : `UPDATE billing_webhook_events SET processing_status = $1, error_message_safe = COALESCE($2, error_message_safe) WHERE id = $3 RETURNING *;`;

    return db.queryOne<BillingWebhookEvent>(sql, [status, errorMessageSafe || null, id]);
  }
}

export const billingWebhookRepository = new BillingWebhookRepository();
