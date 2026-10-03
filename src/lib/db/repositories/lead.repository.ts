import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import {
  Contact,
  Lead,
  LeadStatus,
  LeadStage,
  LeadPriority,
  LeadSourceType,
  FollowUpStatus,
  LeadKPIs,
} from '@/types/crm';

export interface CreateLeadInput {
  id?: string;
  organizationId: string;
  contactId: string;
  title?: string | null;
  status?: LeadStatus;
  stage?: LeadStage;
  sourceId?: string | null;
  sourceType?: LeadSourceType;
  sourceName?: string | null;
  externalId?: string | null;
  externalPlatform?: string | null;
  externalFormId?: string | null;
  externalAdId?: string | null;
  externalCampaignId?: string | null;
  assignedUserId?: string | null;
  assignedAgentId?: string | null;
  priority?: LeadPriority;
  score?: number;
  qualificationStatus?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  rawAttribution?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  tags?: string[];
  nextFollowUpAt?: Date | string | null;
  followUpStatus?: FollowUpStatus;
  firstContactedAt?: Date | string | null;
  lastContactedAt?: Date | string | null;
}

export interface UpdateLeadInput {
  title?: string | null;
  status?: LeadStatus;
  stage?: LeadStage;
  sourceId?: string | null;
  sourceType?: LeadSourceType;
  sourceName?: string | null;
  assignedUserId?: string | null;
  assignedAgentId?: string | null;
  priority?: LeadPriority;
  score?: number;
  qualificationStatus?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  rawAttribution?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  tags?: string[];
  nextFollowUpAt?: Date | string | null;
  followUpStatus?: FollowUpStatus;
  firstContactedAt?: Date | string | null;
  lastContactedAt?: Date | string | null;
  convertedAt?: Date | string | null;
  lostAt?: Date | string | null;
  lostReason?: string | null;
  isArchived?: boolean;
}

export interface LeadListFilters {
  status?: LeadStatus;
  stage?: LeadStage;
  sourceId?: string;
  sourceType?: LeadSourceType;
  assignedUserId?: string;
  assignedAgentId?: string;
  priority?: LeadPriority;
  followUpStatus?: FollowUpStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
  isArchived?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'next_follow_up_at' | 'priority';
  sortOrder?: 'ASC' | 'DESC';
}

export interface SourcePerformanceMetric {
  sourceName: string;
  sourceType: string;
  totalLeads: number;
  leadCount: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
}

export class LeadRepository {
  async create(input: CreateLeadInput, client?: QueryClient): Promise<Lead> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const status = input.status || 'NEW';
    const stage = input.stage || 'NEW';
    const priority = input.priority || 'MEDIUM';
    const score = input.score ?? 0;
    const qualificationStatus = input.qualificationStatus || 'UNQUALIFIED';
    const followUpStatus = input.followUpStatus || 'NONE';
    const sourceType = input.sourceType || 'MANUAL';

    const sql = `
      INSERT INTO leads (
        id, organization_id, contact_id, title, status, stage,
        source_id, source_type, source_name, external_id, external_platform,
        external_form_id, external_ad_id, external_campaign_id,
        assigned_user_id, assigned_agent_id, priority, score,
        qualification_status, utm_source, utm_medium, utm_campaign,
        utm_term, utm_content, raw_attribution, custom_fields, tags,
        next_follow_up_at, follow_up_status, first_contacted_at,
        last_contacted_at, is_archived, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26, $27,
        $28, $29, $30,
        $31, false, NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<Lead>(sql, [
      id,
      input.organizationId,
      input.contactId,
      input.title || null,
      status,
      stage,
      input.sourceId || null,
      sourceType,
      input.sourceName || null,
      input.externalId || null,
      input.externalPlatform || null,
      input.externalFormId || null,
      input.externalAdId || null,
      input.externalCampaignId || null,
      input.assignedUserId || null,
      input.assignedAgentId || null,
      priority,
      score,
      qualificationStatus,
      input.utmSource || null,
      input.utmMedium || null,
      input.utmCampaign || null,
      input.utmTerm || null,
      input.utmContent || null,
      JSON.stringify(input.rawAttribution || {}),
      JSON.stringify(input.customFields || {}),
      input.tags || [],
      input.nextFollowUpAt || null,
      followUpStatus,
      input.firstContactedAt || null,
      input.lastContactedAt || null,
    ]);

    if (!row) {
      throw new Error('Failed to create lead');
    }

    return this.findById(id, input.organizationId, db) as Promise<Lead>;
  }

  async findById(id: string, organizationId: string, client?: QueryClient): Promise<Lead | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT 
        l.*,
        row_to_json(c.*) as contact,
        CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name, 'email', u.email) ELSE NULL END as assigned_user,
        CASE WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'name', a.name) ELSE NULL END as assigned_agent,
        CASE WHEN s.id IS NOT NULL THEN row_to_json(s.*) ELSE NULL END as source
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      LEFT JOIN users u ON u.id = l.assigned_user_id
      LEFT JOIN voice_agents a ON a.id = l.assigned_agent_id
      LEFT JOIN lead_sources s ON s.id = l.source_id
      WHERE l.id = $1 AND l.organization_id = $2;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [id, organizationId]);
    return row ? this.mapRow(row) : null;
  }

  async findByExternalId(
    organizationId: string,
    platform: string,
    externalId: string,
    client?: QueryClient
  ): Promise<Lead | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT 
        l.*,
        row_to_json(c.*) as contact
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.organization_id = $1 AND l.external_platform = $2 AND l.external_id = $3
      LIMIT 1;
    `;

    const row = await db.queryOne<Record<string, unknown>>(sql, [organizationId, platform, externalId]);
    return row ? this.mapRow(row) : null;
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateLeadInput,
    client?: QueryClient
  ): Promise<Lead | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, organizationId, db);
    if (!existing) return null;

    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, organizationId];
    let idx = 3;

    if (input.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(input.title);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(input.status);
    }
    if (input.stage !== undefined) {
      fields.push(`stage = $${idx++}`);
      values.push(input.stage);
    }
    if (input.sourceId !== undefined) {
      fields.push(`source_id = $${idx++}`);
      values.push(input.sourceId);
    }
    if (input.sourceType !== undefined) {
      fields.push(`source_type = $${idx++}`);
      values.push(input.sourceType);
    }
    if (input.sourceName !== undefined) {
      fields.push(`source_name = $${idx++}`);
      values.push(input.sourceName);
    }
    if (input.assignedUserId !== undefined) {
      fields.push(`assigned_user_id = $${idx++}`);
      values.push(input.assignedUserId);
    }
    if (input.assignedAgentId !== undefined) {
      fields.push(`assigned_agent_id = $${idx++}`);
      values.push(input.assignedAgentId);
    }
    if (input.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      values.push(input.priority);
    }
    if (input.score !== undefined) {
      fields.push(`score = $${idx++}`);
      values.push(input.score);
    }
    if (input.qualificationStatus !== undefined) {
      fields.push(`qualification_status = $${idx++}`);
      values.push(input.qualificationStatus);
    }
    if (input.utmSource !== undefined) {
      fields.push(`utm_source = $${idx++}`);
      values.push(input.utmSource);
    }
    if (input.utmMedium !== undefined) {
      fields.push(`utm_medium = $${idx++}`);
      values.push(input.utmMedium);
    }
    if (input.utmCampaign !== undefined) {
      fields.push(`utm_campaign = $${idx++}`);
      values.push(input.utmCampaign);
    }
    if (input.utmTerm !== undefined) {
      fields.push(`utm_term = $${idx++}`);
      values.push(input.utmTerm);
    }
    if (input.utmContent !== undefined) {
      fields.push(`utm_content = $${idx++}`);
      values.push(input.utmContent);
    }
    if (input.rawAttribution !== undefined) {
      fields.push(`raw_attribution = $${idx++}`);
      values.push(JSON.stringify(input.rawAttribution));
    }
    if (input.customFields !== undefined) {
      fields.push(`custom_fields = $${idx++}`);
      values.push(JSON.stringify(input.customFields));
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${idx++}`);
      values.push(input.tags);
    }
    if (input.nextFollowUpAt !== undefined) {
      fields.push(`next_follow_up_at = $${idx++}`);
      values.push(input.nextFollowUpAt);
    }
    if (input.followUpStatus !== undefined) {
      fields.push(`follow_up_status = $${idx++}`);
      values.push(input.followUpStatus);
    }
    if (input.firstContactedAt !== undefined) {
      fields.push(`first_contacted_at = $${idx++}`);
      values.push(input.firstContactedAt);
    }
    if (input.lastContactedAt !== undefined) {
      fields.push(`last_contacted_at = $${idx++}`);
      values.push(input.lastContactedAt);
    }
    if (input.convertedAt !== undefined) {
      fields.push(`converted_at = $${idx++}`);
      values.push(input.convertedAt);
    }
    if (input.lostAt !== undefined) {
      fields.push(`lost_at = $${idx++}`);
      values.push(input.lostAt);
    }
    if (input.lostReason !== undefined) {
      fields.push(`lost_reason = $${idx++}`);
      values.push(input.lostReason);
    }
    if (input.isArchived !== undefined) {
      fields.push(`is_archived = $${idx++}`);
      values.push(input.isArchived);
    }

    const sql = `
      UPDATE leads
      SET ${fields.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING id;
    `;

    await db.queryOne(sql, values);
    return this.findById(id, organizationId, db);
  }

  async delete(
    id: string,
    organizationId: string,
    hardDelete = false,
    client?: QueryClient
  ): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    if (hardDelete) {
      const sql = `DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING id;`;
      const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
      return Boolean(row);
    } else {
      const sql = `UPDATE leads SET is_archived = true, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id;`;
      const row = await db.queryOne<{ id: string }>(sql, [id, organizationId]);
      return Boolean(row);
    }
  }

  async list(
    organizationId: string,
    filters: LeadListFilters = {},
    client?: QueryClient
  ): Promise<Lead[]> {
    const db = client || (await ensureDatabaseReady());
    const conditions: string[] = ['l.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (filters.isArchived !== undefined) {
      conditions.push(`l.is_archived = $${idx++}`);
      values.push(filters.isArchived);
    } else {
      conditions.push(`l.is_archived = false`);
    }

    if (filters.status) {
      conditions.push(`l.status = $${idx++}`);
      values.push(filters.status);
    }

    if (filters.stage) {
      conditions.push(`l.stage = $${idx++}`);
      values.push(filters.stage);
    }

    if (filters.sourceId) {
      conditions.push(`l.source_id = $${idx++}`);
      values.push(filters.sourceId);
    }

    if (filters.sourceType) {
      conditions.push(`l.source_type = $${idx++}`);
      values.push(filters.sourceType);
    }

    if (filters.assignedUserId) {
      conditions.push(`l.assigned_user_id = $${idx++}`);
      values.push(filters.assignedUserId);
    }

    if (filters.assignedAgentId) {
      conditions.push(`l.assigned_agent_id = $${idx++}`);
      values.push(filters.assignedAgentId);
    }

    if (filters.priority) {
      conditions.push(`l.priority = $${idx++}`);
      values.push(filters.priority);
    }

    if (filters.followUpStatus) {
      conditions.push(`l.follow_up_status = $${idx++}`);
      values.push(filters.followUpStatus);
    }

    if (filters.startDate) {
      conditions.push(`l.created_at >= $${idx++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`l.created_at <= $${idx++}`);
      values.push(filters.endDate);
    }

    if (filters.search) {
      conditions.push(
        `(c.full_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.normalized_phone ILIKE $${idx} OR c.company ILIKE $${idx} OR l.external_id ILIKE $${idx} OR l.title ILIKE $${idx})`
      );
      values.push(`%${filters.search}%`);
      idx++;
    }

    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const sql = `
      SELECT 
        l.*,
        row_to_json(c.*) as contact,
        CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name, 'email', u.email) ELSE NULL END as assigned_user,
        CASE WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'name', a.name) ELSE NULL END as assigned_agent,
        CASE WHEN s.id IS NOT NULL THEN row_to_json(s.*) ELSE NULL END as source
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      LEFT JOIN users u ON u.id = l.assigned_user_id
      LEFT JOIN voice_agents a ON a.id = l.assigned_agent_id
      LEFT JOIN lead_sources s ON s.id = l.source_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.${sortBy} ${sortOrder}
      LIMIT ${limit} OFFSET ${offset};
    `;

    const rows = await db.query<Record<string, unknown>>(sql, values);
    return rows.map((r) => this.mapRow(r));
  }

  async count(
    organizationId: string,
    filters: LeadListFilters = {},
    client?: QueryClient
  ): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    const conditions: string[] = ['l.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (filters.isArchived !== undefined) {
      conditions.push(`l.is_archived = $${idx++}`);
      values.push(filters.isArchived);
    } else {
      conditions.push(`l.is_archived = false`);
    }

    if (filters.status) {
      conditions.push(`l.status = $${idx++}`);
      values.push(filters.status);
    }

    if (filters.stage) {
      conditions.push(`l.stage = $${idx++}`);
      values.push(filters.stage);
    }

    if (filters.sourceId) {
      conditions.push(`l.source_id = $${idx++}`);
      values.push(filters.sourceId);
    }

    if (filters.sourceType) {
      conditions.push(`l.source_type = $${idx++}`);
      values.push(filters.sourceType);
    }

    if (filters.assignedUserId) {
      conditions.push(`l.assigned_user_id = $${idx++}`);
      values.push(filters.assignedUserId);
    }

    if (filters.assignedAgentId) {
      conditions.push(`l.assigned_agent_id = $${idx++}`);
      values.push(filters.assignedAgentId);
    }

    if (filters.priority) {
      conditions.push(`l.priority = $${idx++}`);
      values.push(filters.priority);
    }

    if (filters.followUpStatus) {
      conditions.push(`l.follow_up_status = $${idx++}`);
      values.push(filters.followUpStatus);
    }

    if (filters.startDate) {
      conditions.push(`l.created_at >= $${idx++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`l.created_at <= $${idx++}`);
      values.push(filters.endDate);
    }

    if (filters.search) {
      conditions.push(
        `(c.full_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.normalized_phone ILIKE $${idx} OR c.company ILIKE $${idx} OR l.external_id ILIKE $${idx} OR l.title ILIKE $${idx})`
      );
      values.push(`%${filters.search}%`);
      idx++;
    }

    const sql = `
      SELECT COUNT(*)::int as count
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE ${conditions.join(' AND ')};
    `;

    const res = await db.queryOne<{ count: number }>(sql, values);
    return res?.count || 0;
  }

  async getKPIs(organizationId: string, client?: QueryClient): Promise<LeadKPIs> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        COUNT(*)::int as total_leads,
        COUNT(*) FILTER (WHERE status = 'NEW')::int as new_leads,
        COUNT(*) FILTER (WHERE status = 'CONTACTED')::int as contacted_leads,
        COUNT(*) FILTER (WHERE status = 'QUALIFIED')::int as qualified_leads,
        COUNT(*) FILTER (WHERE status = 'CONVERTED')::int as converted_leads,
        COUNT(*) FILTER (WHERE status IN ('LOST', 'DISQUALIFIED'))::int as lost_leads,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int as today_new_leads,
        COUNT(*) FILTER (WHERE next_follow_up_at IS NOT NULL AND follow_up_status = 'PENDING')::int as pending_follow_ups
      FROM leads
      WHERE organization_id = $1 AND is_archived = false;
    `;

    const row = await db.queryOne<{
      total_leads: number;
      new_leads: number;
      contacted_leads: number;
      qualified_leads: number;
      converted_leads: number;
      lost_leads: number;
      today_new_leads: number;
      pending_follow_ups: number;
    }>(sql, [organizationId]);

    // Also get today's calls count for this org
    const callSql = `
      SELECT COUNT(*)::int as today_calls
      FROM calls
      WHERE organization_id = $1 AND created_at >= CURRENT_DATE;
    `;
    const callRow = await db.queryOne<{ today_calls: number }>(callSql, [organizationId]);

    const totalLeads = row?.total_leads || 0;
    const convertedLeads = row?.converted_leads || 0;
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

    return {
      totalLeads,
      newLeads: row?.new_leads || 0,
      contactedLeads: row?.contacted_leads || 0,
      qualifiedLeads: row?.qualified_leads || 0,
      convertedLeads,
      lostLeads: row?.lost_leads || 0,
      todayNewLeads: row?.today_new_leads || 0,
      todayCalls: callRow?.today_calls || 0,
      pendingFollowUps: row?.pending_follow_ups || 0,
      conversionRate,
    };
  }

  async getSourceAnalytics(
    organizationId: string,
    client?: QueryClient
  ): Promise<SourcePerformanceMetric[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        COALESCE(source_name, source_type) as source_name,
        source_type,
        COUNT(*)::int as total_leads,
        COUNT(*) FILTER (WHERE status IN ('CONTACTED', 'QUALIFIED', 'CONVERTED'))::int as contacted_leads,
        COUNT(*) FILTER (WHERE status IN ('QUALIFIED', 'CONVERTED'))::int as qualified_leads,
        COUNT(*) FILTER (WHERE status = 'CONVERTED')::int as converted_leads
      FROM leads
      WHERE organization_id = $1 AND is_archived = false
      GROUP BY COALESCE(source_name, source_type), source_type
      ORDER BY total_leads DESC;
    `;

    const rows = await db.query<Record<string, unknown>>(sql, [organizationId]);
    return rows.map((r) => ({
      sourceName: (r.source_name as string) || '',
      sourceType: (r.source_type as string) || '',
      totalLeads: Number(r.total_leads || 0),
      leadCount: Number(r.total_leads || 0),
      contactedLeads: Number(r.contacted_leads || 0),
      qualifiedLeads: Number(r.qualified_leads || 0),
      convertedLeads: Number(r.converted_leads || 0),
    }));
  }

  private mapRow(row: Record<string, unknown>): Lead {
    const contactObj = row.contact as Record<string, unknown> | undefined;
    return {
      ...(row as unknown as Lead),
      score: Number(row.score || 0),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      raw_attribution:
        typeof row.raw_attribution === 'string'
          ? JSON.parse(row.raw_attribution)
          : (row.raw_attribution as Record<string, unknown>) || {},
      custom_fields:
        typeof row.custom_fields === 'string'
          ? JSON.parse(row.custom_fields)
          : (row.custom_fields as Record<string, unknown>) || {},
      contact:
        contactObj && typeof contactObj === 'object' && contactObj.id
          ? ({
              ...(contactObj as unknown as Contact),
              tags: Array.isArray(contactObj.tags) ? (contactObj.tags as string[]) : [],
              custom_fields:
                typeof contactObj.custom_fields === 'string'
                  ? JSON.parse(contactObj.custom_fields)
                  : (contactObj.custom_fields as Record<string, unknown>) || {},
            } as Contact)
          : undefined,
      assigned_user: (row.assigned_user as Lead['assigned_user']) || null,
      assigned_agent: (row.assigned_agent as Lead['assigned_agent']) || null,
      source: (row.source as Lead['source']) || null,
    };
  }
}

export const leadRepository = new LeadRepository();
