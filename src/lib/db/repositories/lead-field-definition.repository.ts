import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { LeadFieldDefinition, CustomFieldType } from '@/types/crm';

export interface CreateFieldDefinitionInput {
  id?: string;
  organizationId: string;
  name: string;
  key: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
}

export class LeadFieldDefinitionRepository {
  async create(
    input: CreateFieldDefinitionInput,
    client?: QueryClient
  ): Promise<LeadFieldDefinition> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const isRequired = input.isRequired || false;
    const options = input.options || [];

    const sql = `
      INSERT INTO lead_field_definitions (
        id, organization_id, name, key, field_type, options, is_required,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [
      id,
      input.organizationId,
      input.name,
      input.key.toLowerCase().trim(),
      input.fieldType,
      JSON.stringify(options),
      isRequired,
    ]);

    if (!row) {
      throw new Error('Failed to create custom field definition');
    }

    return this.mapRow(row);
  }

  async list(organizationId: string, client?: QueryClient): Promise<LeadFieldDefinition[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM lead_field_definitions
      WHERE organization_id = $1
      ORDER BY created_at ASC;
    `;
    const rows = await db.query<Record<string, unknown>>(sql, [organizationId]);
    return rows.map((r) => this.mapRow(r));
  }

  async findByKey(
    organizationId: string,
    key: string,
    client?: QueryClient
  ): Promise<LeadFieldDefinition | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM lead_field_definitions
      WHERE organization_id = $1 AND key = $2
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, key.toLowerCase().trim()]);
    return row ? this.mapRow(row) : null;
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = `DELETE FROM lead_field_definitions WHERE id = $1 AND organization_id = $2 RETURNING id;`;
    const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
    return Boolean(row);
  }

  private mapRow(row: Record<string, unknown>): LeadFieldDefinition {
    return {
      ...(row as unknown as LeadFieldDefinition),
      options:
        typeof row.options === 'string' ? JSON.parse(row.options) : (row.options as string[]) || [],
    };
  }
}

export const leadFieldDefinitionRepository = new LeadFieldDefinitionRepository();
