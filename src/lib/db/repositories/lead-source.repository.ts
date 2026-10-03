import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { LeadSource, LeadSourceType } from '@/types/crm';

export interface CreateLeadSourceInput {
  id?: string;
  organizationId: string;
  name: string;
  type: LeadSourceType;
  platform?: string | null;
  externalSourceId?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
}

export interface UpdateLeadSourceInput {
  name?: string;
  type?: LeadSourceType;
  platform?: string | null;
  externalSourceId?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
}

export class LeadSourceRepository {
  async create(input: CreateLeadSourceInput, client?: QueryClient): Promise<LeadSource> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const isActive = input.isActive !== undefined ? input.isActive : true;

    const sql = `
      INSERT INTO lead_sources (
        id, organization_id, name, type, platform,
        external_source_id, is_active, config,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [
      id,
      input.organizationId,
      input.name,
      input.type,
      input.platform || null,
      input.externalSourceId || null,
      isActive,
      JSON.stringify(input.config || {}),
    ]);

    if (!row) {
      throw new Error('Failed to create lead source');
    }

    return this.mapRow(row);
  }

  async findById(id: string, organizationId: string, client?: QueryClient): Promise<LeadSource | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM lead_sources WHERE id = $1 AND organization_id = $2;`;
    const row = await db.queryOne<Record<string, unknown>>(sql, [id, organizationId]);
    return row ? this.mapRow(row) : null;
  }

  async findByExternalSourceId(
    organizationId: string,
    externalSourceId: string,
    client?: QueryClient
  ): Promise<LeadSource | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM lead_sources
      WHERE organization_id = $1 AND external_source_id = $2
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, externalSourceId]);
    return row ? this.mapRow(row) : null;
  }

  async findByType(
    organizationId: string,
    type: LeadSourceType,
    client?: QueryClient
  ): Promise<LeadSource[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM lead_sources
      WHERE organization_id = $1 AND type = $2
      ORDER BY created_at DESC;
    `;
    const rows = await db.query<Record<string, unknown>>(sql, [organizationId, type]);
    return rows.map((r) => this.mapRow(r));
  }

  async list(organizationId: string, client?: QueryClient): Promise<LeadSource[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM lead_sources
      WHERE organization_id = $1
      ORDER BY created_at DESC;
    `;
    const rows = await db.query<Record<string, unknown>>(sql, [organizationId]);
    return rows.map((r) => this.mapRow(r));
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateLeadSourceInput,
    client?: QueryClient
  ): Promise<LeadSource | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, organizationId, db);
    if (!existing) return null;

    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.type !== undefined) {
      fields.push(`type = $${idx++}`);
      values.push(input.type);
    }
    if (input.platform !== undefined) {
      fields.push(`platform = $${idx++}`);
      values.push(input.platform);
    }
    if (input.externalSourceId !== undefined) {
      fields.push(`external_source_id = $${idx++}`);
      values.push(input.externalSourceId);
    }
    if (input.isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(input.isActive);
    }
    if (input.config !== undefined) {
      fields.push(`config = $${idx++}`);
      values.push(JSON.stringify(input.config));
    }

    const sql = `
      UPDATE lead_sources
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, values);
    return row ? this.mapRow(row) : null;
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = `DELETE FROM lead_sources WHERE id = $1 AND organization_id = $2 RETURNING id;`;
    const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
    return Boolean(row);
  }

  private mapRow(row: Record<string, unknown>): LeadSource {
    return {
      ...(row as unknown as LeadSource),
      config:
        typeof row.config === 'string'
          ? JSON.parse(row.config)
          : (row.config as LeadSource['config']) || {},
    };
  }
}

export const leadSourceRepository = new LeadSourceRepository();
