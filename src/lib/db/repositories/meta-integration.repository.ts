import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { MetaIntegration, MetaConnectionStatus } from '@/types/crm';

export interface CreateMetaIntegrationInput {
  id?: string;
  organizationId: string;
  pageId?: string | null;
  pageName?: string | null;
  businessId?: string | null;
  adAccountId?: string | null;
  encryptedAccessToken: string;
  tokenMetadata?: Record<string, unknown>;
  webhookVerifyToken?: string | null;
  appSecretProofEnabled?: boolean;
  connectionStatus?: MetaConnectionStatus;
  autoCallEnabled?: boolean;
  autoCallAgentId?: string | null;
  autoCallPhoneNumberId?: string | null;
  createdBy?: string | null;
}

export interface UpdateMetaIntegrationInput {
  pageId?: string | null;
  pageName?: string | null;
  businessId?: string | null;
  adAccountId?: string | null;
  encryptedAccessToken?: string;
  tokenMetadata?: Record<string, unknown>;
  webhookVerifyToken?: string | null;
  appSecretProofEnabled?: boolean;
  connectionStatus?: MetaConnectionStatus;
  autoCallEnabled?: boolean;
  autoCallAgentId?: string | null;
  autoCallPhoneNumberId?: string | null;
  lastVerifiedAt?: Date | string | null;
}

export class MetaIntegrationRepository {
  async create(
    input: CreateMetaIntegrationInput,
    client?: QueryClient
  ): Promise<MetaIntegration> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const connectionStatus = input.connectionStatus || 'ACTIVE';
    const autoCallEnabled = input.autoCallEnabled || false;
    const appSecretProofEnabled =
      input.appSecretProofEnabled !== undefined ? input.appSecretProofEnabled : true;

    const sql = `
      INSERT INTO meta_integrations (
        id, organization_id, platform, page_id, page_name,
        business_id, ad_account_id, encrypted_access_token, token_metadata,
        webhook_verify_token, app_secret_proof_enabled, connection_status,
        auto_call_enabled, auto_call_agent_id, auto_call_phone_number_id,
        connected_at, last_verified_at, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, 'META', $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        NOW(), NOW(), $15, NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [
      id,
      input.organizationId,
      input.pageId || null,
      input.pageName || null,
      input.businessId || null,
      input.adAccountId || null,
      input.encryptedAccessToken,
      JSON.stringify(input.tokenMetadata || {}),
      input.webhookVerifyToken || null,
      appSecretProofEnabled,
      connectionStatus,
      autoCallEnabled,
      input.autoCallAgentId || null,
      input.autoCallPhoneNumberId || null,
      input.createdBy || null,
    ]);

    if (!row) {
      throw new Error('Failed to create Meta integration');
    }

    return this.mapRow(row);
  }

  async findById(
    id: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<MetaIntegration | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM meta_integrations WHERE id = $1 AND organization_id = $2;`;
    const row = await db.queryOne<Record<string, unknown>>(sql, [id, organizationId]);
    return row ? this.mapRow(row) : null;
  }

  async findByPageId(
    organizationId: string,
    pageId: string,
    client?: QueryClient
  ): Promise<MetaIntegration | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM meta_integrations
      WHERE organization_id = $1 AND page_id = $2
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, pageId]);
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find an integration globally by page_id for webhook dispatching.
   * If multiple exist (which shouldn't normally happen across tenants with verified pages), returns the active one.
   */
  async findByPageIdGlobal(pageId: string, client?: QueryClient): Promise<MetaIntegration | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM meta_integrations
      WHERE page_id = $1 AND connection_status = 'ACTIVE'
      ORDER BY updated_at DESC
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [pageId]);
    return row ? this.mapRow(row) : null;
  }

  async getActiveIntegration(
    organizationId: string,
    client?: QueryClient
  ): Promise<MetaIntegration | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM meta_integrations
      WHERE organization_id = $1 AND connection_status = 'ACTIVE'
      ORDER BY updated_at DESC
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId]);
    return row ? this.mapRow(row) : null;
  }

  async list(organizationId: string, client?: QueryClient): Promise<MetaIntegration[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM meta_integrations
      WHERE organization_id = $1
      ORDER BY created_at DESC;
    `;
    const rows = await db.query<Record<string, unknown>>(sql, [organizationId]);
    return rows.map((r) => this.mapRow(r));
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateMetaIntegrationInput,
    client?: QueryClient
  ): Promise<MetaIntegration | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, organizationId, db);
    if (!existing) return null;

    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.pageId !== undefined) {
      fields.push(`page_id = $${idx++}`);
      values.push(input.pageId);
    }
    if (input.pageName !== undefined) {
      fields.push(`page_name = $${idx++}`);
      values.push(input.pageName);
    }
    if (input.businessId !== undefined) {
      fields.push(`business_id = $${idx++}`);
      values.push(input.businessId);
    }
    if (input.adAccountId !== undefined) {
      fields.push(`ad_account_id = $${idx++}`);
      values.push(input.adAccountId);
    }
    if (input.encryptedAccessToken !== undefined) {
      fields.push(`encrypted_access_token = $${idx++}`);
      values.push(input.encryptedAccessToken);
    }
    if (input.tokenMetadata !== undefined) {
      fields.push(`token_metadata = $${idx++}`);
      values.push(JSON.stringify(input.tokenMetadata));
    }
    if (input.webhookVerifyToken !== undefined) {
      fields.push(`webhook_verify_token = $${idx++}`);
      values.push(input.webhookVerifyToken);
    }
    if (input.appSecretProofEnabled !== undefined) {
      fields.push(`app_secret_proof_enabled = $${idx++}`);
      values.push(input.appSecretProofEnabled);
    }
    if (input.connectionStatus !== undefined) {
      fields.push(`connection_status = $${idx++}`);
      values.push(input.connectionStatus);
    }
    if (input.autoCallEnabled !== undefined) {
      fields.push(`auto_call_enabled = $${idx++}`);
      values.push(input.autoCallEnabled);
    }
    if (input.autoCallAgentId !== undefined) {
      fields.push(`auto_call_agent_id = $${idx++}`);
      values.push(input.autoCallAgentId);
    }
    if (input.autoCallPhoneNumberId !== undefined) {
      fields.push(`auto_call_phone_number_id = $${idx++}`);
      values.push(input.autoCallPhoneNumberId);
    }
    if (input.lastVerifiedAt !== undefined) {
      fields.push(`last_verified_at = $${idx++}`);
      values.push(input.lastVerifiedAt);
    }

    const sql = `
      UPDATE meta_integrations
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, values);
    return row ? this.mapRow(row) : null;
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = `DELETE FROM meta_integrations WHERE id = $1 AND organization_id = $2 RETURNING id;`;
    const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
    return Boolean(row);
  }

  private mapRow(row: Record<string, unknown>): MetaIntegration {
    return {
      ...(row as unknown as MetaIntegration),
      token_metadata:
        typeof row.token_metadata === 'string'
          ? JSON.parse(row.token_metadata)
          : (row.token_metadata as MetaIntegration['token_metadata']) || {},
    };
  }
}

export const metaIntegrationRepository = new MetaIntegrationRepository();
