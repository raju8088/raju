import { ensureDatabaseReady, QueryClient } from '../client';

export interface ProviderConnectionRecord {
  id: string;
  organization_id: string;
  provider: 'OMNIDIMENSION';
  display_name: string;
  encrypted_credentials: string;
  status: 'ACTIVE' | 'FAILED' | 'SUSPENDED' | 'REMOVED';
  last_verified_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertProviderConnectionInput {
  organizationId: string;
  provider?: 'OMNIDIMENSION';
  displayName?: string;
  encryptedCredentials: string;
  status?: 'ACTIVE' | 'FAILED' | 'SUSPENDED' | 'REMOVED';
  lastVerifiedAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}

export class ProviderConnectionRepository {
  async findByOrganizationId(
    organizationId: string,
    provider: string = 'OMNIDIMENSION',
    client?: QueryClient
  ): Promise<ProviderConnectionRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<ProviderConnectionRecord>(
      `SELECT * FROM provider_connections 
       WHERE organization_id = $1 AND provider = $2;`,
      [organizationId, provider]
    );
  }

  async upsert(
    input: UpsertProviderConnectionInput,
    client?: QueryClient
  ): Promise<ProviderConnectionRecord> {
    const db = client || (await ensureDatabaseReady());
    const provider = input.provider || 'OMNIDIMENSION';
    const displayName = input.displayName || 'OmniDimension Voice';
    const status = input.status || 'ACTIVE';
    const lastVerified = input.lastVerifiedAt ? input.lastVerifiedAt.toISOString() : null;

    const row = await db.queryOne<ProviderConnectionRecord>(
      `INSERT INTO provider_connections (
        organization_id, provider, display_name, encrypted_credentials,
        status, last_verified_at, last_error_code, last_error_message, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (organization_id, provider) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        encrypted_credentials = EXCLUDED.encrypted_credentials,
        status = EXCLUDED.status,
        last_verified_at = COALESCE(EXCLUDED.last_verified_at, provider_connections.last_verified_at),
        last_error_code = EXCLUDED.last_error_code,
        last_error_message = EXCLUDED.last_error_message,
        updated_at = NOW()
      RETURNING *;`,
      [
        input.organizationId,
        provider,
        displayName,
        input.encryptedCredentials,
        status,
        lastVerified,
        input.lastErrorCode || null,
        input.lastErrorMessage || null,
      ]
    );

    if (!row) {
      throw new Error('Failed to upsert provider connection');
    }
    return row;
  }

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'FAILED' | 'SUSPENDED' | 'REMOVED',
    lastVerifiedAt?: Date | null,
    errorCode?: string | null,
    errorMessage?: string | null,
    client?: QueryClient
  ): Promise<void> {
    const db = client || (await ensureDatabaseReady());
    const verifiedIso = lastVerifiedAt ? lastVerifiedAt.toISOString() : null;
    await db.query(
      `UPDATE provider_connections SET
        status = $1,
        last_verified_at = COALESCE($2, last_verified_at),
        last_error_code = $3,
        last_error_message = $4,
        updated_at = NOW()
       WHERE id = $5;`,
      [status, verifiedIso, errorCode || null, errorMessage || null, id]
    );
  }

  async delete(organizationId: string, provider: string = 'OMNIDIMENSION', client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM provider_connections WHERE organization_id = $1 AND provider = $2 RETURNING id;`,
      [organizationId, provider]
    );
    return res.length > 0;
  }
}

export const providerConnectionRepository = new ProviderConnectionRepository();
