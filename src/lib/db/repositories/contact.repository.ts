import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { Contact } from '@/types/crm';

export interface CreateContactInput {
  id?: string;
  organizationId: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  lastContactedAt?: Date | string | null;
  lastActivityAt?: Date | string | null;
}

export interface UpdateContactInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  lastContactedAt?: Date | string | null;
  lastActivityAt?: Date | string | null;
}

export interface ContactListFilters {
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export class ContactRepository {
  async create(input: CreateContactInput, client?: QueryClient): Promise<Contact> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const fullName =
      input.fullName?.trim() ||
      [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown Contact';

    const sql = `
      INSERT INTO contacts (
        id, organization_id, first_name, last_name, full_name,
        phone, normalized_phone, email, company, city, state, country,
        timezone, tags, custom_fields, last_contacted_at, last_activity_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [
      id,
      input.organizationId,
      input.firstName || null,
      input.lastName || null,
      fullName,
      input.phone || null,
      input.normalizedPhone || null,
      input.email ? input.email.trim().toLowerCase() : null,
      input.company || null,
      input.city || null,
      input.state || null,
      input.country || null,
      input.timezone || null,
      input.tags || [],
      JSON.stringify(input.customFields || {}),
      input.lastContactedAt || null,
      input.lastActivityAt || new Date().toISOString(),
    ]);

    if (!row) {
      throw new Error('Failed to create contact');
    }

    return this.mapRow(row);
  }

  async findById(id: string, organizationId: string, client?: QueryClient): Promise<Contact | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM contacts WHERE id = $1 AND organization_id = $2;`;
    const row = await db.queryOne<Record<string, unknown>>(sql, [id, organizationId]);
    return row ? this.mapRow(row) : null;
  }

  async findByNormalizedPhone(
    organizationId: string,
    normalizedPhone: string,
    client?: QueryClient
  ): Promise<Contact | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM contacts
      WHERE organization_id = $1 AND normalized_phone = $2
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, normalizedPhone]);
    return row ? this.mapRow(row) : null;
  }

  async findByEmail(
    organizationId: string,
    email: string,
    client?: QueryClient
  ): Promise<Contact | null> {
    const db = client || (await ensureDatabaseReady());
    const normalizedEmail = email.trim().toLowerCase();
    const sql = `
      SELECT * FROM contacts
      WHERE organization_id = $1 AND LOWER(email) = $2
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, normalizedEmail]);
    return row ? this.mapRow(row) : null;
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateContactInput,
    client?: QueryClient
  ): Promise<Contact | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, organizationId, db);
    if (!existing) return null;

    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.firstName !== undefined) {
      fields.push(`first_name = $${idx++}`);
      values.push(input.firstName);
    }
    if (input.lastName !== undefined) {
      fields.push(`last_name = $${idx++}`);
      values.push(input.lastName);
    }
    if (input.fullName !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(input.fullName);
    }
    if (input.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(input.phone);
    }
    if (input.normalizedPhone !== undefined) {
      fields.push(`normalized_phone = $${idx++}`);
      values.push(input.normalizedPhone);
    }
    if (input.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(input.email ? input.email.trim().toLowerCase() : null);
    }
    if (input.company !== undefined) {
      fields.push(`company = $${idx++}`);
      values.push(input.company);
    }
    if (input.city !== undefined) {
      fields.push(`city = $${idx++}`);
      values.push(input.city);
    }
    if (input.state !== undefined) {
      fields.push(`state = $${idx++}`);
      values.push(input.state);
    }
    if (input.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(input.country);
    }
    if (input.timezone !== undefined) {
      fields.push(`timezone = $${idx++}`);
      values.push(input.timezone);
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${idx++}`);
      values.push(input.tags);
    }
    if (input.customFields !== undefined) {
      fields.push(`custom_fields = $${idx++}`);
      values.push(JSON.stringify(input.customFields));
    }
    if (input.lastContactedAt !== undefined) {
      fields.push(`last_contacted_at = $${idx++}`);
      values.push(input.lastContactedAt);
    }
    if (input.lastActivityAt !== undefined) {
      fields.push(`last_activity_at = $${idx++}`);
      values.push(input.lastActivityAt);
    }

    const sql = `
      UPDATE contacts
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, values);
    return row ? this.mapRow(row) : null;
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = `DELETE FROM contacts WHERE id = $1 AND organization_id = $2 RETURNING id;`;
    const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
    return Boolean(row);
  }

  async list(
    organizationId: string,
    filters: ContactListFilters = {},
    client?: QueryClient
  ): Promise<Contact[]> {
    const db = client || (await ensureDatabaseReady());
    const conditions: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (filters.search) {
      conditions.push(
        `(full_name ILIKE $${idx} OR email ILIKE $${idx} OR normalized_phone ILIKE $${idx} OR company ILIKE $${idx})`
      );
      values.push(`%${filters.search}%`);
      idx++;
    }

    if (filters.tag) {
      conditions.push(`$${idx} = ANY(tags)`);
      values.push(filters.tag);
      idx++;
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const sql = `
      SELECT * FROM contacts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const rows = await db.query<Record<string, unknown>>(sql, values);
    return rows.map((r) => this.mapRow(r));
  }

  async count(
    organizationId: string,
    filters: ContactListFilters = {},
    client?: QueryClient
  ): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    const conditions: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (filters.search) {
      conditions.push(
        `(full_name ILIKE $${idx} OR email ILIKE $${idx} OR normalized_phone ILIKE $${idx} OR company ILIKE $${idx})`
      );
      values.push(`%${filters.search}%`);
      idx++;
    }

    if (filters.tag) {
      conditions.push(`$${idx} = ANY(tags)`);
      values.push(filters.tag);
      idx++;
    }

    const sql = `SELECT COUNT(*)::int as count FROM contacts WHERE ${conditions.join(' AND ')};`;
    const res = await db.queryOne<{ count: number }>(sql, values);
    return res?.count || 0;
  }

  private mapRow(row: Record<string, unknown>): Contact {
    return {
      ...(row as unknown as Contact),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      custom_fields:
        typeof row.custom_fields === 'string'
          ? JSON.parse(row.custom_fields)
          : (row.custom_fields as Record<string, unknown>) || {},
    };
  }
}

export const contactRepository = new ContactRepository();
