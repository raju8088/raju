import { User, OrganizationMember, Organization } from '@/types';
import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMember['role'];
  status: OrganizationMember['status'];
  created_at: string;
  updated_at: string;
  u_id: string;
  u_email: string;
  u_name: string;
  u_phone: string | null;
  u_auth_provider_id: string | null;
  u_status: User['status'];
  u_created_at: string;
  u_updated_at: string;
  o_id: string;
  o_name: string;
  o_slug: string;
  o_logo_url: string | null;
  o_brand_name: string | null;
  o_status: Organization['status'];
  o_plan_id: string | null;
  o_created_at: string;
  o_updated_at: string;
}

function mapMemberRow(row: MemberRow): OrganizationMember {
  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: row.u_id
      ? {
          id: row.u_id,
          email: row.u_email,
          name: row.u_name,
          phone: row.u_phone,
          auth_provider_id: row.u_auth_provider_id,
          status: row.u_status,
          created_at: row.u_created_at,
          updated_at: row.u_updated_at,
        }
      : undefined,
    organization: row.o_id
      ? {
          id: row.o_id,
          name: row.o_name,
          slug: row.o_slug,
          logo_url: row.o_logo_url,
          brand_name: row.o_brand_name,
          status: row.o_status,
          plan_id: row.o_plan_id,
          created_at: row.o_created_at,
          updated_at: row.o_updated_at,
        }
      : undefined,
  };
}

export const userRepository = {
  async findById(id: string, client?: QueryClient): Promise<User | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, email, name, phone, auth_provider_id, password_hash, status, created_at, updated_at
      FROM users
      WHERE id = $1;
    `;
    const row = await db.queryOne<User>(sql, [id]);
    return row || null;
  },

  async findByEmail(email: string, client?: QueryClient): Promise<User | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, email, name, phone, auth_provider_id, password_hash, status, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1);
    `;
    const row = await db.queryOne<User>(sql, [email]);
    return row || null;
  },

  async list(client?: QueryClient): Promise<User[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, email, name, phone, auth_provider_id, status, created_at, updated_at
      FROM users
      ORDER BY created_at ASC;
    `;
    return db.query<User>(sql);
  },

  async create(
    data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string },
    client?: QueryClient
  ): Promise<User> {
    const db = client || (await ensureDatabaseReady());
    const id = data.id || generateUUID();
    const sql = `
      INSERT INTO users (id, email, name, phone, auth_provider_id, password_hash, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, email, name, phone, auth_provider_id, password_hash, status, created_at, updated_at;
    `;
    const row = await db.queryOne<User>(sql, [
      id,
      data.email.toLowerCase().trim(),
      data.name.trim(),
      data.phone || null,
      data.auth_provider_id || null,
      data.password_hash || null,
      data.status || 'ACTIVE',
    ]);
    if (!row) {
      throw new Error('Failed to insert user record into PostgreSQL');
    }
    return row;
  },

  async update(id: string, data: Partial<User>, client?: QueryClient): Promise<User | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, db);
    if (!existing) return null;

    const email = data.email !== undefined ? data.email.toLowerCase().trim() : existing.email;
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const phone = data.phone !== undefined ? data.phone : existing.phone;
    const authProviderId = data.auth_provider_id !== undefined ? data.auth_provider_id : existing.auth_provider_id;
    const passwordHash = data.password_hash !== undefined ? data.password_hash : existing.password_hash;
    const status = data.status !== undefined ? data.status : existing.status;

    const sql = `
      UPDATE users
      SET email = $2, name = $3, phone = $4, auth_provider_id = $5, password_hash = $6, status = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, name, phone, auth_provider_id, password_hash, status, created_at, updated_at;
    `;
    const row = await db.queryOne<User>(sql, [id, email, name, phone, authProviderId, passwordHash, status]);
    return row || null;
  },

  async delete(id: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = 'DELETE FROM users WHERE id = $1 RETURNING id;';
    const deleted = await db.queryOne<{ id: string }>(sql, [id]);
    return Boolean(deleted);
  },

  // -------------------------------------------------------------
  // Organization Members
  // -------------------------------------------------------------

  async findMemberById(id: string, client?: QueryClient): Promise<OrganizationMember | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        om.id, om.organization_id, om.user_id, om.role, om.status, om.created_at, om.updated_at,
        u.id as u_id, u.email as u_email, u.name as u_name, u.phone as u_phone,
        u.auth_provider_id as u_auth_provider_id, u.status as u_status,
        u.created_at as u_created_at, u.updated_at as u_updated_at,
        o.id as o_id, o.name as o_name, o.slug as o_slug, o.logo_url as o_logo_url,
        o.brand_name as o_brand_name, o.status as o_status, o.plan_id as o_plan_id,
        o.created_at as o_created_at, o.updated_at as o_updated_at
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.id = $1;
    `;
    const row = await db.queryOne<MemberRow>(sql, [id]);
    return row ? mapMemberRow(row) : null;
  },

  async findMemberByOrgAndUser(orgId: string, userId: string, client?: QueryClient): Promise<OrganizationMember | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        om.id, om.organization_id, om.user_id, om.role, om.status, om.created_at, om.updated_at,
        u.id as u_id, u.email as u_email, u.name as u_name, u.phone as u_phone,
        u.auth_provider_id as u_auth_provider_id, u.status as u_status,
        u.created_at as u_created_at, u.updated_at as u_updated_at,
        o.id as o_id, o.name as o_name, o.slug as o_slug, o.logo_url as o_logo_url,
        o.brand_name as o_brand_name, o.status as o_status, o.plan_id as o_plan_id,
        o.created_at as o_created_at, o.updated_at as o_updated_at
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.organization_id = $1 AND om.user_id = $2;
    `;
    const row = await db.queryOne<MemberRow>(sql, [orgId, userId]);
    return row ? mapMemberRow(row) : null;
  },

  async listMembersByOrg(orgId: string, client?: QueryClient): Promise<OrganizationMember[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        om.id, om.organization_id, om.user_id, om.role, om.status, om.created_at, om.updated_at,
        u.id as u_id, u.email as u_email, u.name as u_name, u.phone as u_phone,
        u.auth_provider_id as u_auth_provider_id, u.status as u_status,
        u.created_at as u_created_at, u.updated_at as u_updated_at,
        o.id as o_id, o.name as o_name, o.slug as o_slug, o.logo_url as o_logo_url,
        o.brand_name as o_brand_name, o.status as o_status, o.plan_id as o_plan_id,
        o.created_at as o_created_at, o.updated_at as o_updated_at
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.organization_id = $1
      ORDER BY om.created_at ASC;
    `;
    const rows = await db.query<MemberRow>(sql, [orgId]);
    return rows.map(mapMemberRow);
  },

  async listMembersByUser(userId: string, client?: QueryClient): Promise<OrganizationMember[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        om.id, om.organization_id, om.user_id, om.role, om.status, om.created_at, om.updated_at,
        u.id as u_id, u.email as u_email, u.name as u_name, u.phone as u_phone,
        u.auth_provider_id as u_auth_provider_id, u.status as u_status,
        u.created_at as u_created_at, u.updated_at as u_updated_at,
        o.id as o_id, o.name as o_name, o.slug as o_slug, o.logo_url as o_logo_url,
        o.brand_name as o_brand_name, o.status as o_status, o.plan_id as o_plan_id,
        o.created_at as o_created_at, o.updated_at as o_updated_at
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.user_id = $1
      ORDER BY om.created_at ASC;
    `;
    const rows = await db.query<MemberRow>(sql, [userId]);
    return rows.map(mapMemberRow);
  },

  async createMember(
    data: Omit<OrganizationMember, 'id' | 'created_at' | 'updated_at' | 'user' | 'organization'> & { id?: string },
    client?: QueryClient
  ): Promise<OrganizationMember> {
    const db = client || (await ensureDatabaseReady());
    const id = data.id || generateUUID();
    const sql = `
      INSERT INTO organization_members (id, organization_id, user_id, role, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, organization_id, user_id, role, status, created_at, updated_at;
    `;
    const inserted = await db.queryOne<{ id: string }>(sql, [
      id,
      data.organization_id,
      data.user_id,
      data.role,
      data.status || 'ACTIVE',
    ]);
    if (!inserted) {
      throw new Error('Failed to insert organization member record into PostgreSQL');
    }
    const full = await this.findMemberById(inserted.id, db);
    if (!full) {
      throw new Error('Could not retrieve created organization member');
    }
    return full;
  },

  async updateMember(
    id: string,
    data: Partial<OrganizationMember>,
    client?: QueryClient
  ): Promise<OrganizationMember | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findMemberById(id, db);
    if (!existing) return null;

    const role = data.role !== undefined ? data.role : existing.role;
    const status = data.status !== undefined ? data.status : existing.status;

    const sql = `
      UPDATE organization_members
      SET role = $2, status = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id;
    `;
    const updated = await db.queryOne<{ id: string }>(sql, [id, role, status]);
    if (!updated) return null;
    return this.findMemberById(id, db);
  },

  async deleteMember(id: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = 'DELETE FROM organization_members WHERE id = $1 RETURNING id;';
    const deleted = await db.queryOne<{ id: string }>(sql, [id]);
    return Boolean(deleted);
  },
};
