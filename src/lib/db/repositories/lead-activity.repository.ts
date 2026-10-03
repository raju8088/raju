import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { LeadActivity, LeadActivityType } from '@/types/crm';

export interface CreateLeadActivityInput {
  id?: string;
  organizationId: string;
  leadId: string;
  activityType: LeadActivityType;
  actorId?: string | null;
  referenceId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}

export class LeadActivityRepository {
  async create(input: CreateLeadActivityInput, client?: QueryClient): Promise<LeadActivity> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO lead_activities (
        id, organization_id, lead_id, activity_type,
        actor_id, reference_id, summary, details, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [
      id,
      input.organizationId,
      input.leadId,
      input.activityType,
      input.actorId || null,
      input.referenceId || null,
      input.summary,
      JSON.stringify(input.details || {}),
    ]);

    if (!row) {
      throw new Error('Failed to create lead activity');
    }

    return this.mapRow(row);
  }

  async listByLeadId(
    leadId: string,
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<LeadActivity[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT 
        a.*,
        u.name as actor_name
      FROM lead_activities a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.lead_id = $1 AND a.organization_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const rows = await db.query<Record<string, unknown>>(sql, [leadId, organizationId, limit, offset]);
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): LeadActivity {
    return {
      ...(row as unknown as LeadActivity),
      details:
        typeof row.details === 'string'
          ? JSON.parse(row.details)
          : (row.details as Record<string, unknown>) || {},
    };
  }

  findByLeadId = this.listByLeadId.bind(this);
}

export const leadActivityRepository = new LeadActivityRepository();
