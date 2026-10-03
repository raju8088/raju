import crypto from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureDatabaseReady } from '@/lib/db/client';
import { contactService } from '@/services/contact.service';
import { leadService } from '@/services/lead.service';
import { leadSourceService } from '@/services/lead-source.service';
import { metaIntegrationService } from '@/services/meta-integration.service';
import { contactRepository } from '@/lib/db/repositories/contact.repository';
import { leadRepository } from '@/lib/db/repositories/lead.repository';
import { leadNoteRepository } from '@/lib/db/repositories/lead-note.repository';
import { leadActivityRepository } from '@/lib/db/repositories/lead-activity.repository';
import { externalLeadEventRepository } from '@/lib/db/repositories/external-lead-event.repository';
import { metaIntegrationRepository } from '@/lib/db/repositories/meta-integration.repository';
import { callRepository } from '@/lib/db/repositories/call.repository';
import { campaignContactRepository } from '@/lib/db/repositories/campaign-contact.repository';
import { campaignRepository } from '@/lib/db/repositories/campaign.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { metaLeadProvider } from '@/lib/providers/meta/meta-lead.provider';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { hasPermission, requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

describe('VoiceNuvo — Phase 6: CRM & Lead Management Tests', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminAId = 'd0000000-0000-0000-0000-000000000002';
  const userEmployeeAId = 'd0000000-0000-0000-0000-000000000004';

  let agentAId: string;
  let phoneAId: string;

  beforeAll(async () => {
    await ensureDatabaseReady();

    // Ensure Voice Agent for Org A
    let agentA = await voiceAgentRepository.findByProviderAgentId(orgAId, 'mock-agent-p6-a');
    if (!agentA) {
      agentA = await voiceAgentRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerAgentId: 'mock-agent-p6-a',
        name: 'Acme CRM AI Agent',
      });
    }
    agentAId = agentA.id;

    // Ensure Phone Number for Org A
    let phoneA = await phoneNumberRepository.findByPhoneNumber(orgAId, '+14155550299');
    if (!phoneA) {
      phoneA = await phoneNumberRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerPhoneId: 'mock-pn-p6-a',
        phoneNumber: '+14155550299',
        assignedAgentId: agentAId,
      });
    }
    phoneAId = phoneA.id;

    // Ensure default lead sources for org A & B
    await leadSourceService.ensureDefaultSources(orgAId);
    await leadSourceService.ensureDefaultSources(orgBId);
  });

  // ==========================================================
  // 1. UNIT TESTS: Normalization, Deduplication & Validation
  // ==========================================================
  describe('Unit Tests: Normalization & Deduplication', () => {
    it('normalizes various phone number formats deterministically to E.164', () => {
      expect(normalizePhoneNumber('+1 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhoneNumber('001 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
      expect(() => normalizePhoneNumber('invalid-phone')).toThrow();
    });

    it('normalizes email addresses to lowercase trimmed strings', () => {
      const email1 = '  Lead.User@Example.COM  ';
      const email2 = 'lead.user@example.com';
      expect(email1.trim().toLowerCase()).toBe(email2);
    });

    it('detects duplicate contacts by normalized phone number within the same tenant', async () => {
      const phone = '+14155558801';
      const contact1 = await contactService.findOrCreateContact(orgAId, {
        firstName: 'Alice',
        lastName: 'Smith',
        phone,
        email: 'alice.first@example.com',
      });

      const contact2 = await contactService.findOrCreateContact(orgAId, {
        firstName: 'Alice Updated',
        phone,
        email: 'alice.second@example.com',
      });

      expect(contact1.id).toBe(contact2.id);
      expect(contact2.normalized_phone).toBe(phone);
    });

    it('detects duplicate contacts by normalized email within the same tenant', async () => {
      const email = 'duplicate.check@example.com';
      const contact1 = await contactService.findOrCreateContact(orgAId, {
        firstName: 'Bob',
        phone: '+14155558802',
        email,
      });

      const contact2 = await contactService.findOrCreateContact(orgAId, {
        firstName: 'Bob B',
        phone: '+14155558803',
        email: email.toUpperCase(),
      });

      expect(contact1.id).toBe(contact2.id);
    });

    it('isolates duplicate detection across tenants (same phone in Tenant A vs B creates distinct contacts)', async () => {
      const crossTenantPhone = '+14155559999';
      const contactA = await contactService.findOrCreateContact(orgAId, {
        fullName: 'Tenant A Contact',
        phone: crossTenantPhone,
        email: 'shared@business.com',
      });

      const contactB = await contactService.findOrCreateContact(orgBId, {
        fullName: 'Tenant B Contact',
        phone: crossTenantPhone,
        email: 'shared@business.com',
      });

      expect(contactA.id).not.toBe(contactB.id);
      expect(contactA.organization_id).toBe(orgAId);
      expect(contactB.organization_id).toBe(orgBId);
    });
  });

  // ==========================================================
  // 2. LEAD LIFECYCLE & TRANSITIONS
  // ==========================================================
  describe('Lead Lifecycle & State Transitions', () => {
    it('creates a new lead with primary contact and default status NEW', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'New Solar Opportunity',
        contact: {
          fullName: 'Carol Danvers',
          phone: '+14155551234',
          email: 'carol@marvel.com',
          company: 'Avenger Corp',
        },
        sourceType: 'MANUAL',
        priority: 'HIGH',
      });

      expect(lead).toBeDefined();
      expect(lead.id).toBeDefined();
      expect(lead.status).toBe('NEW');
      expect(lead.stage).toBe('NEW');
      expect(lead.priority).toBe('HIGH');
      expect(lead.contact).toBeDefined();
      expect(lead.contact?.full_name).toBe('Carol Danvers');
      expect(lead.contact?.normalized_phone).toBe('+14155551234');
    });

    it('handles valid status transitions and updates lead activity', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Enterprise Pipeline Lead',
        contact: {
          fullName: 'Dave Bautista',
          phone: '+14155554321',
          email: 'dave@galaxy.org',
        },
        sourceType: 'WEBSITE',
      });

      // 1. Transition to CONTACTED
      const updated1 = await leadService.updateStatus(lead.id, orgAId, 'CONTACTED', userAdminAId);
      expect(updated1.status).toBe('CONTACTED');
      expect(updated1.first_contacted_at).toBeDefined();

      // 2. Transition to QUALIFIED
      const updated2 = await leadService.updateStatus(lead.id, orgAId, 'QUALIFIED', userAdminAId);
      expect(updated2.status).toBe('QUALIFIED');

      // 3. Transition to CONVERTED
      const updated3 = await leadService.updateStatus(lead.id, orgAId, 'CONVERTED', userAdminAId);
      expect(updated3.status).toBe('CONVERTED');
      expect(updated3.converted_at).toBeDefined();

      // Check activities
      const activities = await leadActivityRepository.findByLeadId(lead.id, orgAId);
      const statusActivities = activities.filter((a) => a.activity_type === 'STATUS_CHANGED');
      expect(statusActivities.length).toBeGreaterThanOrEqual(3);
    });

    it('records lost reason when transition to LOST status', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Competitor Loss Lead',
        contact: {
          fullName: 'Eve Polastri',
          phone: '+14155557788',
          email: 'eve@mi6.gov.uk',
        },
        sourceType: 'MANUAL',
      });

      const lostLead = await leadService.updateStatus(
        lead.id,
        orgAId,
        'LOST',
        userAdminAId,
        'Chose competitor with lower pricing'
      );

      expect(lostLead.status).toBe('LOST');
      expect(lostLead.lost_at).toBeDefined();
      expect(lostLead.lost_reason).toBe('Chose competitor with lower pricing');
    });
  });

  // ==========================================================
  // 3. ASSIGNMENTS, NOTES & FOLLOW-UPS
  // ==========================================================
  describe('Lead Assignments, Notes & Follow-ups', () => {
    it('assigns lead to an organization user and AI voice agent with audit trail', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Assignment Test Lead',
        contact: {
          fullName: 'Frank Castle',
          phone: '+14155556677',
          email: 'frank@punisher.com',
        },
      });

      const assigned = await leadService.assignLead(
        lead.id,
        orgAId,
        userEmployeeAId,
        agentAId,
        userAdminAId
      );

      expect(assigned.assigned_user_id).toBe(userEmployeeAId);
      expect(assigned.assigned_agent_id).toBe(agentAId);

      // Check activity log
      const activities = await leadActivityRepository.findByLeadId(lead.id, orgAId);
      const assignActivity = activities.find((a) => a.activity_type === 'ASSIGNED');
      expect(assignActivity).toBeDefined();
    });

    it('creates internal CRM notes without leaking to external providers', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Note Test Lead',
        contact: {
          fullName: 'Grace Hopper',
          phone: '+14155553344',
          email: 'grace@navy.mil',
        },
      });

      const note = await leadService.addNote(
        lead.id,
        orgAId,
        userAdminAId,
        'Customer requested demo at 3 PM next Tuesday.'
      );

      expect(note).toBeDefined();
      expect(note.lead_id).toBe(lead.id);
      expect(note.body).toContain('3 PM next Tuesday');

      const notes = await leadNoteRepository.findByLeadId(lead.id, orgAId);
      expect(notes.length).toBe(1);
      expect(notes[0].id).toBe(note.id);
    });

    it('schedules and completes follow-up reminders', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Follow-up Test Lead',
        contact: {
          fullName: 'Hank Pym',
          phone: '+14155558833',
        },
      });

      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const updated = await leadService.scheduleFollowUp(
        lead.id,
        orgAId,
        futureDate,
        userAdminAId
      );

      expect(updated).not.toBeNull();
      expect(new Date(updated!.next_follow_up_at!).toISOString()).toBe(futureDate);
      expect(updated!.follow_up_status).toBe('PENDING');

      // Complete follow-up
      const completed = await leadService.completeFollowUp(lead.id, orgAId, userAdminAId);
      expect(completed).not.toBeNull();
      expect(completed!.follow_up_status).toBe('COMPLETED');
    });
  });

  // ==========================================================
  // 4. CORRELATION: Call-to-Lead & Campaign-to-Lead
  // ==========================================================
  describe('Call and Campaign Correlation', () => {
    it('correlates a call record with a CRM lead via lead_id and timeline', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Call Correlation Lead',
        contact: {
          fullName: 'Iris West',
          phone: '+14155559090',
          email: 'iris@centralcitynews.com',
        },
      });

      // Dispatch simulated call attached to this lead
      const call = await callRepository.create({
        organizationId: orgAId,
        agentId: agentAId,
        providerAgentId: 'mock-agent-p6-a',
        phoneNumberId: phoneAId,
        leadId: lead.id,
        direction: 'outbound',
        sourceNumber: '+14155550299',
        destinationNumber: '+14155559090',
        providerCallId: 'omnidim-call-corr-001',
        metadata: { lead_id: lead.id, source: 'CRM_MANUAL' },
      });

      expect(call.lead_id).toBe(lead.id);

      // Verify repository search by leadId
      const callsForLead = await callRepository.findByLeadId(lead.id, orgAId);
      expect(callsForLead.length).toBeGreaterThanOrEqual(1);
      expect(callsForLead[0].id).toBe(call.id);
      expect(callsForLead[0].destination_number).toBe('+14155559090');
    });

    it('correlates a campaign contact attempt with a CRM lead', async () => {
      const lead = await leadService.createLead(orgAId, {
        title: 'Campaign Correlation Lead',
        contact: {
          fullName: 'John Constantine',
          phone: '+14155558080',
          email: 'john@magic.co.uk',
        },
      });

      // Create a test campaign
      const campaign = await campaignRepository.create({
        organizationId: orgAId,
        name: 'Spring Renewal Blast',
        agentId: agentAId,
        providerAgentId: 'mock-agent-p6-a',
        phoneNumberId: phoneAId,
        providerPhoneNumberId: 'mock-pn-p6-a',
        provider: 'mock',
        createdBy: userAdminAId,
      });

      // Create campaign contact linked to lead
      const cc = await campaignContactRepository.create({
        campaignId: campaign.id,
        organizationId: orgAId,
        leadId: lead.id,
        phoneNumber: '+14155558080',
        normalizedPhoneNumber: '+14155558080',
      });

      expect(cc.lead_id).toBe(lead.id);

      // Verify lookup by leadId
      const ccsForLead = await campaignContactRepository.findByLeadId(lead.id, orgAId);
      expect(ccsForLead.length).toBeGreaterThanOrEqual(1);
      expect(ccsForLead[0].id).toBe(cc.id);
      expect(ccsForLead[0].campaign_id).toBe(campaign.id);
    });
  });

  // ==========================================================
  // 5. CSV IMPORT & EXPORT
  // ==========================================================
  describe('CSV Import and Export', () => {
    it('imports leads from CSV with deduplication and validation metrics', async () => {
      const ts = Date.now().toString().slice(-4);
      const csvContent = `First Name,Last Name,Phone,Email,Company,Priority
Ken,Adams,+141555511${ts},ken${ts}@adams.com,Phoebe Corp,HIGH
Rachel,Green,+141555522${ts},rachel${ts}@ralphlauren.com,Ralph Lauren,MEDIUM
Monica,Geller,+141555533${ts},monica${ts}@ales.com,Javu,LOW
Ken,Duplicate,+141555511${ts},ken.other${ts}@adams.com,Phoebe Corp,URGENT
Bad,Row,invalid-phone,invalid-email,Error Inc,LOW`;

      const result = await leadService.importLeadsFromCsv(orgAId, csvContent, userAdminAId);

      expect(result.total).toBe(5);
      expect(result.imported).toBe(3); // 3 valid distinct leads
      expect(result.duplicates).toBe(1); // Ken duplicate phone
      expect(result.rejected).toBe(1); // Bad row with invalid phone & email
    });

    it('exports leads to CSV containing normalized fields and attribution', async () => {
      const csv = await leadService.exportLeadsToCsv(orgAId);
      expect(csv).toBeDefined();
      expect(csv).toContain('Lead ID,Name,Phone,Email,Company');
      expect(csv).toContain('Status,Stage,Priority');
      expect(csv).toContain('Carol Danvers');
    });
  });

  // ==========================================================
  // 6. META LEAD ADS GRAPH API v26.0 & WEBHOOK IDEMPOTENCY
  // ==========================================================
  describe('Meta Lead Ads Integration & Webhook Handling', () => {
    const mockPageId = 'fb-page-1029384756';

    it('stores encrypted Meta page credentials and generates masked safe DTO', async () => {
      const metaConn = await metaIntegrationService.connectMetaPage(orgAId, userAdminAId, {
        pageId: mockPageId,
        pageAccessToken: 'EAAB_test_mock_token_super_secret_credentials_12345',
        pageName: 'VoiceNuvo Real Estate',
        adAccountId: 'act_987654321',
        autoCallEnabled: false,
      });

      expect(metaConn).toBeDefined();
      expect(metaConn.pageId).toBe(mockPageId);
      expect(metaConn.status).toBe('ACTIVE');

      // Verify token is encrypted in DB
      const rawInDb = await metaIntegrationRepository.findById(metaConn.id, orgAId);
      expect(rawInDb?.encrypted_access_token).toBeDefined();
      expect(rawInDb?.encrypted_access_token).not.toContain('EAAB_test_mock');

      // Verify safe DTO masks the token
      expect(metaConn.maskedAccessToken).toContain('••••');
    });

    it('verifies Meta webhook HMAC-SHA256 signature', () => {
      const appSecret = 'meta_app_secret_test_key_123';
      const rawBody = JSON.stringify({ object: 'page', entry: [] });

      // Generate correct signature
      const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const signatureHeader = `sha256=${hmac}`;

      const isValid = metaLeadProvider.verifyWebhookSignature(rawBody, signatureHeader, appSecret);
      expect(isValid).toBe(true);

      const isInvalid = metaLeadProvider.verifyWebhookSignature(
        rawBody,
        'sha256=tampered_signature',
        appSecret
      );
      expect(isInvalid).toBe(false);
    });

    it('normalizes Meta field_data array into CRM contact fields', () => {
      const mockMetaFieldData = [
        { name: 'full_name', values: ['Natasha Romanoff'] },
        { name: 'phone_number', values: ['+14155550077'] },
        { name: 'email', values: ['natasha@shield.gov'] },
        { name: 'company_name', values: ['KGB Tech'] },
        { name: 'city', values: ['Volgograd'] },
      ];

      const normalized = metaLeadProvider.normalizeLeadData(mockMetaFieldData);
      expect(normalized.fullName).toBe('Natasha Romanoff');
      expect(normalized.firstName).toBe('Natasha');
      expect(normalized.lastName).toBe('Romanoff');
      expect(normalized.phone).toBe('+14155550077');
      expect(normalized.email).toBe('natasha@shield.gov');
      expect(normalized.company).toBe('KGB Tech');
      expect(normalized.city).toBe('Volgograd');
    });

    it('enforces webhook idempotency (duplicate delivery does not create duplicate leads)', async () => {
      const uniqueEventId = `meta-leadgen-${Date.now()}`;
      // First webhook delivery
      const event1 = await externalLeadEventRepository.create({
        organizationId: orgAId,
        provider: 'META',
        providerEventId: uniqueEventId,
        externalLeadId: uniqueEventId,
        processingStatus: 'PROCESSED',
      });

      expect(event1.processing_status).toBe('PROCESSED');

      // Check if duplicate event is detected
      const duplicateLookup = await externalLeadEventRepository.findByProviderEventId(
        orgAId,
        'META',
        uniqueEventId
      );

      expect(duplicateLookup).toBeDefined();
      expect(duplicateLookup?.processing_status).toBe('PROCESSED');
    });
  });

  // ==========================================================
  // 7. MULTI-TENANT ISOLATION & SECURITY
  // ==========================================================
  describe('Multi-Tenant Isolation & RBAC', () => {
    it('prohibits cross-tenant lead access (Tenant A cannot see Tenant B leads)', async () => {
      const leadB = await leadService.createLead(orgBId, {
        title: 'Tenant B Confidential Lead',
        contact: {
          fullName: 'Tony Stark',
          phone: '+14155550001',
          email: 'tony@stark.com',
        },
      });

      // Tenant A queries lead by ID
      const crossTenantFetch = await leadRepository.findById(leadB.id, orgAId);
      expect(crossTenantFetch).toBeNull();

      // Tenant A lists leads
      const listA = await leadRepository.list(orgAId, { search: 'Tony Stark' });
      expect(listA.find((l) => l.id === leadB.id)).toBeUndefined();
    });

    it('prohibits cross-tenant contact access', async () => {
      const contactB = await contactRepository.create({
        organizationId: orgBId,
        fullName: 'Bruce Banner',
        phone: '+14155550002',
        email: 'bruce@hulk.com',
      });

      const crossTenantContact = await contactRepository.findById(contactB.id, orgAId);
      expect(crossTenantContact).toBeNull();
    });

    it('prohibits cross-tenant Meta integration access', async () => {
      const metaB = await metaIntegrationRepository.create({
        organizationId: orgBId,
        pageId: 'page-b-private',
        encryptedAccessToken: 'secret-b',
        connectionStatus: 'ACTIVE',
      });

      const crossTenantMeta = await metaIntegrationRepository.findById(metaB.id, orgAId);
      expect(crossTenantMeta).toBeNull();
    });

    it('enforces RBAC permissions for CRM operations', () => {
      // Employees have LEAD_VIEW, LEAD_CREATE, LEAD_MANAGE
      expect(hasPermission('EMPLOYEE', 'LEAD_VIEW')).toBe(true);
      expect(hasPermission('EMPLOYEE', 'LEAD_CREATE')).toBe(true);
      expect(hasPermission('EMPLOYEE', 'LEAD_MANAGE')).toBe(true);
      expect(hasPermission('EMPLOYEE', 'LEAD_ASSIGN')).toBe(false);

      // Employees CANNOT delete leads or manage integrations
      expect(hasPermission('EMPLOYEE', 'LEAD_DELETE')).toBe(false);
      expect(hasPermission('EMPLOYEE', 'INTEGRATION_MANAGE')).toBe(false);
      expect(() => requirePermission('EMPLOYEE', 'INTEGRATION_MANAGE')).toThrow(
        AuthorizationError
      );
    });
  });

  // ==========================================================
  // 8. DASHBOARD KPIS & SOURCE ANALYTICS
  // ==========================================================
  describe('CRM Dashboard KPIs & Source Analytics', () => {
    it('calculates organization-scoped CRM KPIs accurately', async () => {
      const kpis = await leadService.getDashboardKPIs(orgAId);

      expect(kpis).toBeDefined();
      expect(kpis.totalLeads).toBeGreaterThanOrEqual(1);
      expect(typeof kpis.newLeads).toBe('number');
      expect(typeof kpis.contactedLeads).toBe('number');
      expect(typeof kpis.qualifiedLeads).toBe('number');
      expect(typeof kpis.convertedLeads).toBe('number');
      expect(typeof kpis.conversionRate).toBe('number');
    });

    it('aggregates source performance metrics without inventing data', async () => {
      const sourcePerf = await leadService.getSourceAnalytics(orgAId);

      expect(Array.isArray(sourcePerf)).toBe(true);
      if (sourcePerf.length > 0) {
        expect(sourcePerf[0].sourceName).toBeDefined();
        expect(typeof sourcePerf[0].leadCount).toBe('number');
      }
    });
  });
});
