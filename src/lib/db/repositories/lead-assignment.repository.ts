import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { LeadAssignment } from '@/types/crm';

export interface CreateLeadAssignmentInput {
  id?: string;
  organizationId: string;
  leadId: string;
  previousUserId?: string | null;
  newUserId?: string | null;
  previousAgentId?: string | null;
  newAgentId?: string | null;
  actorId?: string | null;
}

export class LeadAssignmentRepository {
  async create(input: CreateLeadAssignmentInput, client?: QueryClient): Promise<LeadAssignment> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO lead_assignments (
        id, organization_id, lead_id, previous_user_id, new_user_id,
        previous_agent_id, new_agent_id, actor_id, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<LeadAssignment>(sql, [
      id,
      input.organizationId,
      input.leadId,
      input.previousUserId || null,
      input.newUserId || null,
      input.previousAgentId || null,
      input.newAgentId || null,
      input.actorId || null,
    ]);

    if (!row) {
      throw new Error('Failed to record lead assignment');
    }

    return row;
  }

  async listByLeadId(
    leadId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<LeadAssignment[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT 
        a.*,
        u.name as actor_name
      FROM lead_assignments a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.lead_id = $1 AND a.organization_id = $2
      ORDER BY a.created_at DESC;
    `;

    return db.query<LeadAssignment>(sql, [leadId, organizationId]);
  }
}

export const leadAssignmentRepository = new LeadAssignmentRepository();
