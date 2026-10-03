import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { LeadNote } from '@/types/crm';

export interface CreateLeadNoteInput {
  id?: string;
  organizationId: string;
  leadId: string;
  authorId?: string | null;
  body: string;
}

export class LeadNoteRepository {
  async create(input: CreateLeadNoteInput, client?: QueryClient): Promise<LeadNote> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO lead_notes (
        id, organization_id, lead_id, author_id, body,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<LeadNote>(sql, [
      id,
      input.organizationId,
      input.leadId,
      input.authorId || null,
      input.body.trim(),
    ]);

    if (!row) {
      throw new Error('Failed to create lead note');
    }

    return row;
  }

  async listByLeadId(
    leadId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<LeadNote[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT 
        n.*,
        u.name as author_name
      FROM lead_notes n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.lead_id = $1 AND n.organization_id = $2
      ORDER BY n.created_at DESC;
    `;

    return db.query<LeadNote>(sql, [leadId, organizationId]);
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const sql = `DELETE FROM lead_notes WHERE id = $1 AND organization_id = $2 RETURNING id;`;
    const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
    return Boolean(row);
  }

  findByLeadId = this.listByLeadId.bind(this);
}

export const leadNoteRepository = new LeadNoteRepository();
