import { Organization } from '@/types';
import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export const organizationRepository = {
  async findById(id: string, client?: QueryClient): Promise<Organization | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at
      FROM organizations
      WHERE id = $1;
    `;
    const row = await db.queryOne<Organization>(sql, [id]);
    return row || null;
  },

  async findBySlug(slug: string, client?: QueryClient): Promise<Organization | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at
      FROM organizations
      WHERE LOWER(slug) = LOWER($1);
    `;
    const row = await db.queryOne<Organization>(sql, [slug]);
    return row || null;
  },

  async list(client?: QueryClient): Promise<Organization[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at
      FROM organizations
      ORDER BY created_at ASC;
    `;
    return db.query<Organization>(sql);
  },

  async create(
    data: Omit<Organization, 'id' | 'created_at' | 'updated_at'> & { id?: string },
    client?: QueryClient
  ): Promise<Organization> {
    const db = client || (await ensureDatabaseReady());
    const id = data.id || generateUUID();
    const sql = `
      INSERT INTO organizations (id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at;
    `;
    const row = await db.queryOne<Organization>(sql, [
      id,
      data.name,
      data.slug.toLowerCase().trim(),
      data.logo_url || null,
      data.brand_name || data.name,
      data.status || 'ACTIVE',
      data.plan_id || null,
    ]);
    if (!row) {
      throw new Error('Failed to insert organization record into PostgreSQL');
    }
    return row;
  },

  async update(id: string, data: Partial<Organization>, client?: QueryClient): Promise<Organization | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, db);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name : existing.name;
    const slug = data.slug !== undefined ? data.slug.toLowerCase().trim() : existing.slug;
    const logoUrl = data.logo_url !== undefined ? data.logo_url : existing.logo_url;
    const brandName = data.brand_name !== undefined ? data.brand_name : existing.brand_name;
    const status = data.status !== undefined ? data.status : existing.status;
    const planId = data.plan_id !== undefined ? data.plan_id : existing.plan_id;

    const sql = `
      UPDATE organizations
      SET name = $2, slug = $3, logo_url = $4, brand_name = $5, status = $6, plan_id = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, slug, logo_url, brand_name, status, plan_id, created_at, updated_at;
    `;
    const row = await db.queryOne<Organization>(sql, [id, name, slug, logoUrl, brandName, status, planId]);
    return row || null;
  },

  async delete(id: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = 'DELETE FROM organizations WHERE id = $1 RETURNING id;';
    const deleted = await db.queryOne<{ id: string }>(sql, [id]);
    return Boolean(deleted);
  },
};
