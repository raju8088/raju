import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export interface AuditLogEntry {
  id?: string;
  actor_user_id?: string | null;
  organization_id?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at?: string;
}

export const auditRepository = {
  async record(entry: AuditLogEntry, client?: QueryClient): Promise<AuditLogEntry> {
    const db = client || (await ensureDatabaseReady());
    const id = entry.id || generateUUID();
    const sql = `
      INSERT INTO audit_logs (id, actor_user_id, organization_id, action, resource_type, resource_id, metadata, ip_address, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id, actor_user_id, organization_id, action, resource_type, resource_id, metadata, ip_address, created_at;
    `;
    const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;
    const row = await db.queryOne<AuditLogEntry>(sql, [
      id,
      entry.actor_user_id || null,
      entry.organization_id || null,
      entry.action,
      entry.resource_type || null,
      entry.resource_id || null,
      metadataJson,
      entry.ip_address || null,
    ]);
    if (!row) {
      throw new Error('Failed to record audit log');
    }
    return row;
  },

  async listByOrg(orgId: string, limit = 50, client?: QueryClient): Promise<AuditLogEntry[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, actor_user_id, organization_id, action, resource_type, resource_id, metadata, ip_address, created_at
      FROM audit_logs
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    return db.query<AuditLogEntry>(sql, [orgId, limit]);
  },

  async listByUser(userId: string, limit = 50, client?: QueryClient): Promise<AuditLogEntry[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, actor_user_id, organization_id, action, resource_type, resource_id, metadata, ip_address, created_at
      FROM audit_logs
      WHERE actor_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    return db.query<AuditLogEntry>(sql, [userId, limit]);
  },

  async listAll(limit = 100, client?: QueryClient): Promise<AuditLogEntry[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT id, actor_user_id, organization_id, action, resource_type, resource_id, metadata, ip_address, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    return db.query<AuditLogEntry>(sql, [limit]);
  },
};
