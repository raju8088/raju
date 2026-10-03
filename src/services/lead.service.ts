import {
  leadRepository,
  UpdateLeadInput,
  LeadListFilters,
  SourcePerformanceMetric,
} from '@/lib/db/repositories/lead.repository';
import { contactService } from './contact.service';
import { leadSourceService } from './lead-source.service';
import { leadActivityRepository } from '@/lib/db/repositories/lead-activity.repository';
import { leadNoteRepository } from '@/lib/db/repositories/lead-note.repository';
import { leadAssignmentRepository } from '@/lib/db/repositories/lead-assignment.repository';
import { externalLeadEventRepository } from '@/lib/db/repositories/external-lead-event.repository';
import { callRepository, CallRecord } from '@/lib/db/repositories/call.repository';
import {
  campaignContactRepository,
  CampaignContactRecord,
} from '@/lib/db/repositories/campaign-contact.repository';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { callService } from './call.service';
import {
  Lead,
  LeadStatus,
  LeadStage,
  LeadPriority,
  LeadSourceType,
  LeadActivity,
  LeadNote,
  LeadAssignment,
  LeadKPIs,
} from '@/types/crm';
import { logger } from '@/lib/utils/logger';
import { normalizePhoneNumber } from '@/lib/utils/phone';

export interface IngestLeadInput {
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    timezone?: string | null;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
  lead: {
    title?: string | null;
    status?: LeadStatus;
    stage?: LeadStage;
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
    externalId?: string | null;
    externalPlatform?: string | null;
    externalFormId?: string | null;
    externalAdId?: string | null;
    externalCampaignId?: string | null;
  };
  sourceType?: LeadSourceType;
  sourceId?: string | null;
  sourceName?: string | null;
  providerEventId?: string | null;
  autoCallOverride?: {
    enabled: boolean;
    agentId?: string;
    phoneNumberId?: string;
  };
  actorId?: string | null;
}

export class LeadService {
  /**
   * Deterministic Lead Ingestion Pipeline.
   * Handles:
   * 1. Idempotency check against provider event ID / external ID
   * 2. Contact resolution / deduplication by phone/email
   * 3. Lead record creation with attribution
   * 4. Activity logging
   * 5. Optional, idempotent auto-call dispatch
   */
  async ingestLead(
    organizationId: string,
    input: IngestLeadInput
  ): Promise<{ lead: Lead; isDuplicate: boolean; autoCallDispatched: boolean }> {
    const sourceType = input.sourceType || 'MANUAL';
    const externalPlatform = input.lead.externalPlatform || (sourceType === 'META_LEAD_AD' ? 'META' : null);
    const externalId = input.lead.externalId || null;
    const providerEventId = input.providerEventId || externalId;

    // 1. Webhook / External Event Idempotency Check
    if (providerEventId && externalPlatform) {
      const existingEvent = await externalLeadEventRepository.findByProviderEventId(
        organizationId,
        externalPlatform,
        providerEventId
      );

      if (existingEvent && existingEvent.lead_id) {
        const existingLead = await leadRepository.findById(existingEvent.lead_id, organizationId);
        if (existingLead) {
          logger.info('lead.ingest_duplicate_event', {
            action: 'LEAD_INGEST_IDEMPOTENT',
            metadata: { leadId: existingLead.id, providerEventId, organizationId },
          });
          return { lead: existingLead, isDuplicate: true, autoCallDispatched: false };
        }
      }
    }

    // 2. Platform External ID Deduplication Check
    if (externalId && externalPlatform) {
      const existingLead = await leadRepository.findByExternalId(
        organizationId,
        externalPlatform,
        externalId
      );
      if (existingLead) {
        logger.info('lead.ingest_duplicate_external_id', {
          action: 'LEAD_INGEST_IDEMPOTENT',
          metadata: { leadId: existingLead.id, externalId, organizationId },
        });
        return { lead: existingLead, isDuplicate: true, autoCallDispatched: false };
      }
    }

    // 3. Resolve or create contact (deduplicates on phone/email)
    const { contact } = await contactService.resolveOrCreateContact(
      organizationId,
      input.contact
    );

    // 4. Resolve source ID if not provided
    let sourceId = input.sourceId;
    let sourceName = input.sourceName;
    if (!sourceId) {
      const defaultSource = await leadSourceService.getSourceByType(organizationId, sourceType);
      if (defaultSource) {
        sourceId = defaultSource.id;
        sourceName = sourceName || defaultSource.name;
      }
    }

    // 5. Create Lead
    const createdLead = await leadRepository.create({
      organizationId,
      contactId: contact.id,
      title: input.lead.title || `${contact.full_name} (${sourceType})`,
      status: input.lead.status || 'NEW',
      stage: input.lead.stage || 'NEW',
      sourceId,
      sourceType,
      sourceName: sourceName || sourceType,
      externalId,
      externalPlatform,
      externalFormId: input.lead.externalFormId,
      externalAdId: input.lead.externalAdId,
      externalCampaignId: input.lead.externalCampaignId,
      priority: input.lead.priority || 'MEDIUM',
      score: input.lead.score || 0,
      qualificationStatus: input.lead.qualificationStatus || 'UNQUALIFIED',
      utmSource: input.lead.utmSource,
      utmMedium: input.lead.utmMedium,
      utmCampaign: input.lead.utmCampaign,
      utmTerm: input.lead.utmTerm,
      utmContent: input.lead.utmContent,
      rawAttribution: input.lead.rawAttribution,
      customFields: input.lead.customFields,
      tags: input.lead.tags,
    });

    // 6. Record external event idempotency row if applicable
    if (providerEventId && externalPlatform) {
      try {
        await externalLeadEventRepository.create({
          organizationId,
          provider: externalPlatform,
          providerEventId,
          externalLeadId: externalId,
          processingStatus: 'PROCESSED',
          leadId: createdLead.id,
        });
      } catch (err) {
        logger.warn('lead.record_event_warning', {
          action: 'LEAD_EVENT_RECORD',
          errorMessage: (err as Error).message,
        });
      }
    }

    // 7. Record LEAD_CREATED Activity
    await leadActivityRepository.create({
      organizationId,
      leadId: createdLead.id,
      activityType: 'LEAD_CREATED',
      actorId: input.actorId || null,
      summary: `Lead created from source ${sourceName || sourceType}`,
      details: {
        sourceType,
        externalId,
        attribution: input.lead.rawAttribution || {},
      },
    });

    // 8. Auto-Call Pipeline Check
    let autoCallDispatched = false;
    const autoCallConfig = input.autoCallOverride;

    if (autoCallConfig?.enabled && autoCallConfig.agentId && contact.normalized_phone) {
      // Protect against test environments triggering accidental real calls (Section 73)
      const isTestEnv = process.env.NODE_ENV === 'test';
      const allowLiveCalls = process.env.RUN_LIVE_CALL_TEST === 'true';

      if (!isTestEnv || allowLiveCalls) {
        try {
          const callIdempotencyKey = `auto_call:${createdLead.id}:${sourceType}`;
          const actorId = input.actorId || '00000000-0000-0000-0000-000000000000';

          const call = await callService.dispatchCall(
            organizationId,
            actorId,
            {
              agentId: autoCallConfig.agentId,
              toNumber: contact.normalized_phone,
              fromNumberId: autoCallConfig.phoneNumberId,
              metadata: {
                lead_id: createdLead.id,
                source: sourceType,
                auto_call: true,
              },
              idempotencyKey: callIdempotencyKey,
            }
          );

          autoCallDispatched = true;

          // Update lead status and timeline
          await leadRepository.update(createdLead.id, organizationId, {
            firstContactedAt: new Date().toISOString(),
            lastContactedAt: new Date().toISOString(),
            status: 'CONTACTED',
          });

          await leadActivityRepository.create({
            organizationId,
            leadId: createdLead.id,
            activityType: 'CALL_DISPATCHED',
            actorId: input.actorId || null,
            referenceId: call.id,
            summary: `Automated outbound call dispatched to ${contact.normalized_phone}`,
            details: { callId: call.id, providerCallId: call.providerCallId },
          });
        } catch (callErr) {
          logger.error('lead.auto_call_failed', {
            action: 'AUTO_CALL',
            metadata: { leadId: createdLead.id, error: (callErr as Error).message },
          });
          await leadActivityRepository.create({
            organizationId,
            leadId: createdLead.id,
            activityType: 'CALL_FAILED',
            actorId: input.actorId || null,
            summary: `Automated outbound call failed: ${(callErr as Error).message}`,
          });
        }
      }
    }

    return { lead: createdLead, isDuplicate: false, autoCallDispatched };
  }

  async getLead(id: string, organizationId: string): Promise<Lead | null> {
    return leadRepository.findById(id, organizationId);
  }

  async listLeads(
    organizationId: string,
    filters: LeadListFilters = {}
  ): Promise<{ leads: Lead[]; total: number }> {
    const [leads, total] = await Promise.all([
      leadRepository.list(organizationId, filters),
      leadRepository.count(organizationId, filters),
    ]);

    return { leads, total };
  }

  async updateLead(
    id: string,
    organizationId: string,
    input: UpdateLeadInput,
    actorId?: string
  ): Promise<Lead | null> {
    const existing = await leadRepository.findById(id, organizationId);
    if (!existing) return null;

    const updated = await leadRepository.update(id, organizationId, input);

    if (input.status && input.status !== existing.status) {
      await leadActivityRepository.create({
        organizationId,
        leadId: id,
        activityType: 'STATUS_CHANGED',
        actorId: actorId || null,
        summary: `Status changed from ${existing.status} to ${input.status}`,
        details: { previousStatus: existing.status, newStatus: input.status },
      });
    }

    if (input.stage && input.stage !== existing.stage) {
      await leadActivityRepository.create({
        organizationId,
        leadId: id,
        activityType: 'STAGE_CHANGED',
        actorId: actorId || null,
        summary: `Stage changed from ${existing.stage} to ${input.stage}`,
        details: { previousStage: existing.stage, newStage: input.stage },
      });
    }

    return updated;
  }

  async createLead(
    organizationId: string,
    params: {
      title?: string;
      contact: {
        fullName?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        email?: string;
        company?: string;
        city?: string;
        state?: string;
        country?: string;
        tags?: string[];
      };
      sourceType?: LeadSourceType;
      sourceId?: string;
      sourceName?: string;
      priority?: LeadPriority;
      stage?: LeadStage;
      status?: LeadStatus;
      score?: number;
      externalId?: string;
      externalPlatform?: string;
      actorId?: string;
    }
  ): Promise<Lead> {
    const res = await this.ingestLead(organizationId, {
      contact: params.contact,
      lead: {
        title: params.title,
        priority: params.priority,
        stage: params.stage,
        status: params.status,
        score: params.score,
        externalId: params.externalId,
        externalPlatform: params.externalPlatform,
      },
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      actorId: params.actorId,
    });
    return res.lead;
  }

  async updateStatus(
    leadId: string,
    organizationId: string,
    status: LeadStatus,
    actorId?: string,
    lostReason?: string
  ): Promise<Lead> {
    const updates: UpdateLeadInput = { status };
    if (status === 'CONTACTED') {
      updates.firstContactedAt = new Date().toISOString();
      updates.lastContactedAt = new Date().toISOString();
    } else if (status === 'CONVERTED') {
      updates.convertedAt = new Date().toISOString();
    } else if (status === 'LOST') {
      updates.lostAt = new Date().toISOString();
      if (lostReason) updates.lostReason = lostReason;
    }
    const updated = await this.updateLead(leadId, organizationId, updates, actorId);
    if (!updated) throw new Error('Lead not found');
    return updated;
  }

  async completeFollowUp(
    leadId: string,
    organizationId: string,
    actorId?: string
  ): Promise<Lead> {
    const updated = await leadRepository.update(leadId, organizationId, {
      followUpStatus: 'COMPLETED',
    });
    if (!updated) throw new Error('Lead not found');
    await leadActivityRepository.create({
      organizationId,
      leadId,
      activityType: 'FOLLOW_UP_COMPLETED',
      actorId: actorId || null,
      summary: 'Follow-up marked as completed',
    });
    return updated;
  }

  async assignLead(
    id: string,
    organizationId: string,
    assignmentOrUserId: { userId?: string | null; agentId?: string | null } | string | null,
    agentIdParam?: string | null,
    actorIdParam?: string
  ): Promise<Lead> {
    const assignment: { userId?: string | null; agentId?: string | null } =
      typeof assignmentOrUserId === 'object' && assignmentOrUserId !== null
        ? assignmentOrUserId
        : { userId: assignmentOrUserId, agentId: agentIdParam };
    const actorId =
      typeof assignmentOrUserId === 'object' ? (agentIdParam as string) : actorIdParam;

    const existing = await leadRepository.findById(id, organizationId);
    if (!existing) throw new Error('Lead not found');

    // Verify user belongs to org if assigned
    if (assignment.userId) {
      const user = await userRepository.findById(assignment.userId);
      if (!user) {
        throw new Error('Assigned user not found');
      }
    }

    // Verify agent belongs to org if assigned
    if (assignment.agentId) {
      const agent = await voiceAgentRepository.findById(assignment.agentId, organizationId);
      if (!agent) {
        throw new Error('Assigned voice agent not found or does not belong to your organization');
      }
    }

    // Record assignment history
    await leadAssignmentRepository.create({
      organizationId,
      leadId: id,
      previousUserId: existing.assigned_user_id,
      newUserId: assignment.userId !== undefined ? assignment.userId : existing.assigned_user_id,
      previousAgentId: existing.assigned_agent_id,
      newAgentId: assignment.agentId !== undefined ? assignment.agentId : existing.assigned_agent_id,
      actorId: actorId || null,
    });

    const updated = await leadRepository.update(id, organizationId, {
      assignedUserId: assignment.userId,
      assignedAgentId: assignment.agentId,
    });

    if (!updated) throw new Error('Failed to update lead assignment');

    await leadActivityRepository.create({
      organizationId,
      leadId: id,
      activityType: 'ASSIGNED',
      actorId: actorId || null,
      summary: `Lead assignment updated`,
      details: assignment,
    });

    return updated;
  }

  async addNote(
    leadId: string,
    organizationId: string,
    bodyOrAuthorId: string,
    authorOrBody?: string
  ): Promise<LeadNote> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bodyOrAuthorId);
    let body = bodyOrAuthorId;
    let authorId = authorOrBody;
    if (isUuid && authorOrBody && !/^[0-9a-f]{8}-/i.test(authorOrBody)) {
      authorId = bodyOrAuthorId;
      body = authorOrBody;
    }

    const note = await leadNoteRepository.create({
      organizationId,
      leadId,
      authorId: authorId || null,
      body,
    });

    await leadActivityRepository.create({
      organizationId,
      leadId,
      activityType: 'NOTE_ADDED',
      actorId: authorId || null,
      referenceId: note.id,
      summary: `Internal note added`,
      details: { snippet: body.slice(0, 100) },
    });

    return note;
  }

  async scheduleFollowUp(
    leadId: string,
    organizationId: string,
    nextFollowUpAt: Date | string,
    actorId?: string
  ): Promise<Lead | null> {
    const dateStr = new Date(nextFollowUpAt).toISOString();
    const updated = await leadRepository.update(leadId, organizationId, {
      nextFollowUpAt: dateStr,
      followUpStatus: 'PENDING',
    });

    await leadActivityRepository.create({
      organizationId,
      leadId,
      activityType: 'FOLLOW_UP_CREATED',
      actorId: actorId || null,
      summary: `Follow-up scheduled for ${new Date(dateStr).toLocaleString()}`,
      details: { nextFollowUpAt: dateStr },
    });

    return updated;
  }

  async callLead(
    leadId: string,
    organizationId: string,
    params: { agentId: string; fromNumberId?: string },
    actorId: string,
    ipAddress?: string
  ): Promise<CallRecord> {
    const lead = await leadRepository.findById(leadId, organizationId);
    if (!lead) {
      throw new Error('Lead not found');
    }

    const phone = lead.contact?.normalized_phone || lead.contact?.phone;
    if (!phone) {
      throw new Error('Lead contact does not have a valid phone number');
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    // Call existing Phase 4 CallService with lead correlation
    const callDTO = await callService.dispatchCall(
      organizationId,
      actorId,
      {
        agentId: params.agentId,
        toNumber: normalizedPhone,
        fromNumberId: params.fromNumberId,
        metadata: {
          lead_id: lead.id,
          source: lead.source_type,
        },
      },
      ipAddress
    );

    // Update lead contacted timestamps and status if new
    await leadRepository.update(leadId, organizationId, {
      lastContactedAt: new Date().toISOString(),
      firstContactedAt: lead.first_contacted_at || new Date().toISOString(),
      status: lead.status === 'NEW' ? 'CONTACTED' : lead.status,
    });

    // Record timeline activity
    await leadActivityRepository.create({
      organizationId,
      leadId,
      activityType: 'CALL_DISPATCHED',
      actorId,
      referenceId: callDTO.id,
      summary: `Outbound call dispatched to ${normalizedPhone}`,
      details: { callId: callDTO.id, agentId: params.agentId },
    });

    const callRecord = await callRepository.findById(callDTO.id, organizationId);
    if (!callRecord) throw new Error('Failed to retrieve dispatched call record');
    return callRecord;
  }

  async getActivities(leadId: string, organizationId: string): Promise<LeadActivity[]> {
    return leadActivityRepository.listByLeadId(leadId, organizationId);
  }

  async getNotes(leadId: string, organizationId: string): Promise<LeadNote[]> {
    return leadNoteRepository.listByLeadId(leadId, organizationId);
  }

  async getAssignments(leadId: string, organizationId: string): Promise<LeadAssignment[]> {
    return leadAssignmentRepository.listByLeadId(leadId, organizationId);
  }

  async getCalls(leadId: string, organizationId: string): Promise<CallRecord[]> {
    return callRepository.findByLeadId(leadId, organizationId);
  }

  async getCampaigns(leadId: string, organizationId: string): Promise<CampaignContactRecord[]> {
    return campaignContactRepository.findByLeadId(leadId, organizationId);
  }

  async deleteLead(id: string, organizationId: string, hardDelete = false): Promise<boolean> {
    return leadRepository.delete(id, organizationId, hardDelete);
  }

  async getDashboardKPIs(organizationId: string): Promise<LeadKPIs> {
    return leadRepository.getKPIs(organizationId);
  }

  async getSourceAnalytics(organizationId: string): Promise<SourcePerformanceMetric[]> {
    return leadRepository.getSourceAnalytics(organizationId);
  }

  /**
   * Bulk import leads from CSV string
   */
  async importLeadsFromCSV(
    organizationId: string,
    csvContent: string,
    actorId?: string
  ): Promise<{
    total: number;
    imported: number;
    skipped: number;
    duplicates: number;
    rejected: number;
    errors: string[];
  }> {
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return { total: 0, imported: 0, skipped: 0, duplicates: 0, rejected: 0, errors: ['CSV is empty or missing headers'] };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    let imported = 0;
    let duplicates = 0;
    let rejected = 0;
    let skipped = 0;
    const errors: string[] = [];

    const nameIdx = headers.findIndex((h) => h.includes('name'));
    const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'));
    const emailIdx = headers.findIndex((h) => h.includes('email'));
    const companyIdx = headers.findIndex((h) => h.includes('company') || h.includes('org'));
    const sourceIdx = headers.findIndex((h) => h.includes('source'));

    const seenBatchPhones = new Set<string>();
    const seenBatchEmails = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        skipped++;
        continue;
      }

      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const fullName = nameIdx >= 0 ? cols[nameIdx] : 'CSV Lead';
      const rawPhone = phoneIdx >= 0 ? cols[phoneIdx] : null;
      const email = emailIdx >= 0 ? cols[emailIdx] : null;
      const company = companyIdx >= 0 ? cols[companyIdx] : null;
      const sourceName = sourceIdx >= 0 && cols[sourceIdx] ? cols[sourceIdx] : 'CSV Import';

      if (!rawPhone && !email) {
        rejected++;
        errors.push(`Row ${i}: Missing both phone and email`);
        continue;
      }

      let phone: string | null = null;
      if (rawPhone) {
        try {
          phone = normalizePhoneNumber(rawPhone);
        } catch (e) {
          rejected++;
          errors.push(`Row ${i}: Invalid phone ${rawPhone} - ${(e as Error).message}`);
          continue;
        }
      }

      // Check intra-batch duplicate
      if (phone && seenBatchPhones.has(phone)) {
        duplicates++;
        continue;
      }
      if (email && seenBatchEmails.has(email.toLowerCase())) {
        duplicates++;
        continue;
      }
      if (phone) seenBatchPhones.add(phone);
      if (email) seenBatchEmails.add(email.toLowerCase());

      try {
        const res = await this.ingestLead(organizationId, {
          contact: {
            fullName,
            phone,
            email,
            company,
          },
          lead: {
            title: `${fullName} (CSV)`,
            status: 'NEW',
            stage: 'NEW',
            priority: 'MEDIUM',
          },
          sourceType: 'CSV',
          sourceName,
          actorId,
        });

        if (res.isDuplicate) {
          duplicates++;
        } else {
          imported++;
        }
      } catch (err) {
        rejected++;
        errors.push(`Row ${i}: ${(err as Error).message}`);
      }
    }

    return { total: imported + duplicates + rejected + skipped, imported, skipped, duplicates, rejected, errors };
  }

  /**
   * Export leads to CSV format
   */
  async exportLeadsToCSV(
    organizationId: string,
    filters: LeadListFilters = {}
  ): Promise<string> {
    const leads = await leadRepository.list(organizationId, {
      ...filters,
      limit: 10000,
    });

    const header = [
      'Lead ID',
      'Name',
      'Phone',
      'Email',
      'Company',
      'Source Type',
      'Source Name',
      'Status',
      'Stage',
      'Priority',
      'Score',
      'Assigned User',
      'Assigned Agent',
      'Next Follow-Up',
      'Created At',
    ].join(',');

    const rows = leads.map((l) => {
      const escape = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      return [
        escape(l.id),
        escape(l.contact?.full_name),
        escape(l.contact?.normalized_phone || l.contact?.phone),
        escape(l.contact?.email),
        escape(l.contact?.company),
        escape(l.source_type),
        escape(l.source_name),
        escape(l.status),
        escape(l.stage),
        escape(l.priority),
        escape(l.score),
        escape(l.assigned_user?.name),
        escape(l.assigned_agent?.name),
        escape(l.next_follow_up_at),
        escape(l.created_at),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  importLeadsFromCsv = this.importLeadsFromCSV.bind(this);
  exportLeadsToCsv = this.exportLeadsToCSV.bind(this);
}

export const leadService = new LeadService();
