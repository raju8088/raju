import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureDatabaseReady } from '@/lib/db/client';
import { MockVoiceProvider } from '@/lib/providers/voice/mock.provider';
import {
  setGlobalMockVoiceProvider,
  providerConnectionService,
} from '@/services/provider-connection.service';
import { campaignService } from '@/services/campaign.service';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import {
  parseAndValidateCsv,
  createCampaignSchema,
} from '@/lib/validation/campaign.schema';
import {
  normalizeCampaignStatus,
  normalizeLineCallStatus,
} from '@/lib/providers/voice/omnidimension/omnidimension.mapper';
import { hasPermission, requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { OrgContext } from '@/types';

describe('VoiceNuvo — Phase 5: Bulk Calling & Campaign Engine Tests', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminAId = 'd0000000-0000-0000-0000-000000000002';
  const userAdminBId = 'd0000000-0000-0000-0000-000000000003';
  const userEmployeeAId = 'd0000000-0000-0000-0000-000000000004';

  let mockProvider: MockVoiceProvider;
  let agentAId: string;
  let agentBId: string;
  let phoneAId: string;
  let phoneBId: string;

  beforeAll(async () => {
    await ensureDatabaseReady();

    // 1. Ensure Agent for Org A
    let agentA = await voiceAgentRepository.findByProviderAgentId(orgAId, 'mock-agent-p5-a');
    if (!agentA) {
      agentA = await voiceAgentRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerAgentId: 'mock-agent-p5-a',
        name: 'Acme Campaign Agent',
      });
    }
    agentAId = agentA.id;

    // 2. Ensure Agent for Org B
    let agentB = await voiceAgentRepository.findByProviderAgentId(orgBId, 'mock-agent-p5-b');
    if (!agentB) {
      agentB = await voiceAgentRepository.create({
        organizationId: orgBId,
        provider: 'OMNIDIMENSION',
        providerAgentId: 'mock-agent-p5-b',
        name: 'Globex Campaign Agent',
      });
    }
    agentBId = agentB.id;

    // 3. Ensure Phone Number for Org A
    let phoneA = await phoneNumberRepository.findByPhoneNumber(orgAId, '+14155550199');
    if (!phoneA) {
      phoneA = await phoneNumberRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerPhoneId: 'mock-pn-p5-a',
        phoneNumber: '+14155550199',
        assignedAgentId: agentAId,
      });
    }
    phoneAId = phoneA.id;

    // 4. Ensure Phone Number for Org B
    let phoneB = await phoneNumberRepository.findByPhoneNumber(orgBId, '+14155550299');
    if (!phoneB) {
      phoneB = await phoneNumberRepository.create({
        organizationId: orgBId,
        provider: 'OMNIDIMENSION',
        providerPhoneId: 'mock-pn-p5-b',
        phoneNumber: '+14155550299',
        assignedAgentId: agentBId,
      });
    }
    phoneBId = phoneB.id;

    // Initialize mock provider once for the entire suite so state is preserved across lifecycle tests
    mockProvider = new MockVoiceProvider();
    setGlobalMockVoiceProvider(mockProvider);

    // Ensure active provider connection for Org A & B
    await providerConnectionService.saveOrUpdateConnection(
      orgAId,
      userAdminAId,
      'test_key_phase5_a'
    );
    await providerConnectionService.saveOrUpdateConnection(
      orgBId,
      userAdminBId,
      'test_key_phase5_b'
    );
  });

  afterAll(() => {
    setGlobalMockVoiceProvider(null);
  });

  // ============================================================
  // 1. UNIT TESTS: Normalization, CSV Parsing & Validation
  // ============================================================
  describe('Unit Tests: Phone & CSV Validation', () => {
    it('normalizes valid international E.164 phone numbers', () => {
      expect(normalizePhoneNumber('+14155552671')).toBe('+14155552671');
      expect(normalizePhoneNumber('  +91 98765 43210  ')).toBe('+919876543210');
      expect(normalizePhoneNumber('00441234567890')).toBe('+441234567890');
    });

    it('rejects invalid or malformed phone numbers', () => {
      expect(() => normalizePhoneNumber('not-a-number')).toThrow();
      expect(() => normalizePhoneNumber('12345')).toThrow();
      expect(() => normalizePhoneNumber('+0123456789')).toThrow(); // 0 is invalid country code
      expect(() => normalizePhoneNumber('')).toThrow();
    });

    it('parses CSV and performs row-level validation with accepted and rejected counts', () => {
      const csv = `phone_number,first_name,property,budget,external_id
+14155552671,Ravi,3BHK,12000000,lead_101
+919876543210,Aditi,Villa,25000000,lead_102
invalid-phone,John,Apartment,5000000,lead_103
+14155552671,Ravi Duplicate,3BHK,12000000,lead_104`;

      const result = parseAndValidateCsv(csv);
      expect(result.accepted.length).toBe(2);
      expect(result.rejected.length).toBe(2); // 1 invalid format, 1 duplicate

      expect(result.accepted[0].normalizedPhoneNumber).toBe('+14155552671');
      expect(result.accepted[0].customVariables).toEqual({
        first_name: 'Ravi',
        property: '3BHK',
        budget: '12000000',
      });
      expect(result.accepted[0].metadata).toEqual({
        external_id: 'lead_101',
      });

      expect(result.rejected[0].row).toBe(4); // row index for invalid-phone
      expect(result.rejected[1].reason).toContain('Duplicate');
    });

    it('detects alternative column header aliases (mobile, contact, phone)', () => {
      const csv = `mobile,customer_name
+14155550001,Alice
+14155550002,Bob`;

      const result = parseAndValidateCsv(csv);
      expect(result.accepted.length).toBe(2);
      expect(result.accepted[0].normalizedPhoneNumber).toBe('+14155550001');
      expect(result.accepted[0].customVariables).toEqual({ customer_name: 'Alice' });
    });

    it('validates campaign creation schema bounds', () => {
      const valid = createCampaignSchema.safeParse({
        name: 'Fall Outreach',
        agentId: 'a0000000-0000-0000-0000-000000000001',
        phoneNumberId: 'b0000000-0000-0000-0000-000000000001',
        concurrency: 5,
        timezone: 'Asia/Kolkata',
      });
      expect(valid.success).toBe(true);

      // Concurrency too high
      const invalid = createCampaignSchema.safeParse({
        name: 'Fall Outreach',
        agentId: 'a0000000-0000-0000-0000-000000000001',
        concurrency: 999,
      });
      expect(invalid.success).toBe(false);
    });

    it('normalizes provider campaign and line call statuses safely', () => {
      expect(normalizeCampaignStatus('draft')).toBe('DRAFT');
      expect(normalizeCampaignStatus('in_progress')).toBe('IN_PROGRESS');
      expect(normalizeCampaignStatus('running')).toBe('IN_PROGRESS');
      expect(normalizeCampaignStatus('paused')).toBe('PAUSED');
      expect(normalizeCampaignStatus('completed')).toBe('COMPLETED');
      expect(normalizeCampaignStatus('unknown_status_xyz')).toBe('DRAFT'); // safe fallback

      expect(normalizeLineCallStatus('completed')).toBe('COMPLETED');
      expect(normalizeLineCallStatus('busy')).toBe('BUSY');
      expect(normalizeLineCallStatus('no_answer')).toBe('NO_ANSWER');
      expect(normalizeLineCallStatus('failed')).toBe('FAILED');
    });
  });

  // ============================================================
  // 2. INTEGRATION TESTS: Campaign Lifecycle & Operations
  // ============================================================
  describe('Integration Tests: Campaign Lifecycle (Draft -> Start -> Pause -> Resume -> Concurrency -> Retry -> Cancel)', () => {
    let testCampaignId: string;

    it('creates a campaign in DRAFT status initially with audit log', async () => {
      const campaign = await campaignService.createCampaign(
        orgAId,
        userAdminAId,
        {
          name: 'Q4 Product Launch',
          description: 'Outbound campaign for verified leads',
          agentId: agentAId,
          phoneNumberId: phoneAId,
          concurrency: 3,
          timezone: 'Asia/Kolkata',
          saveAsDraft: true,
        },
        '192.168.1.1'
      );

      expect(campaign).toBeDefined();
      expect(campaign.id).toBeDefined();
      expect(campaign.status).toBe('DRAFT');
      expect(campaign.organization_id).toBe(orgAId);
      expect(campaign.concurrency).toBe(3);
      expect(campaign.total_contacts).toBe(0);

      testCampaignId = campaign.id;

      // Verify Audit Log
      const logs = await auditRepository.listByOrg(orgAId, 5);
      const createLog = logs.find((l) => l.action === 'CAMPAIGN_CREATED');
      expect(createLog).toBeDefined();
      expect(createLog?.actor_user_id).toBe(userAdminAId);
    });

    it('imports contacts with batching and updates campaign contact counters', async () => {
      const contactsToImport = [
        {
          phone_number: '+14155551001',
          custom_variables: { first_name: 'John', plan: 'Enterprise' },
          metadata: { lead_id: 'lead_01' },
        },
        {
          phone_number: '+14155551002',
          custom_variables: { first_name: 'Sarah', plan: 'Growth' },
          metadata: { lead_id: 'lead_02' },
        },
        {
          phone_number: '+14155551003',
          custom_variables: { first_name: 'Michael', plan: 'Starter' },
          metadata: { lead_id: 'lead_03' },
        },
        {
          phone_number: 'invalid-number-xyz', // Should be rejected safely
          custom_variables: { first_name: 'Bad' },
        },
      ];

      const result = await campaignService.addContacts(
        orgAId,
        testCampaignId,
        userAdminAId,
        { contacts: contactsToImport },
        '192.168.1.1'
      );

      expect(result.acceptedCount).toBe(3);
      expect(result.rejectedCount).toBe(1);
      expect(result.totalCampaignContacts).toBe(3);

      // Verify campaign record has updated total_contacts
      const updatedCampaign = await campaignService.getCampaign(orgAId, testCampaignId);
      expect(updatedCampaign.total_contacts).toBe(3);

      // Verify contact list
      const contactsList = await campaignService.listContacts(orgAId, testCampaignId, {});
      expect(contactsList.total).toBe(3);
      expect(contactsList.contacts[0].normalized_phone_number).toBe('+14155551001');
    });

    it('starts campaign: transitions to IN_PROGRESS and sets started_at', async () => {
      const started = await campaignService.startCampaign(
        orgAId,
        testCampaignId,
        userAdminAId,
        '192.168.1.1'
      );

      expect(started.status).toBe('IN_PROGRESS');
      expect(started.started_at).toBeDefined();

      // Verify Provider State
      expect(mockProvider.campaigns.size).toBeGreaterThan(0);
      const pCamp = Array.from(mockProvider.campaigns.values()).find((c) => c.name === 'Q4 Product Launch');
      expect(['running', 'IN_PROGRESS']).toContain(pCamp?.status);

      // Verify Idempotency: Calling start again returns current in-progress campaign
      const idempotent = await campaignService.startCampaign(orgAId, testCampaignId, userAdminAId);
      expect(idempotent.status).toBe('IN_PROGRESS');
    });

    it('pauses and resumes campaign', async () => {
      // Pause
      const paused = await campaignService.pauseCampaign(
        orgAId,
        testCampaignId,
        userAdminAId,
        '192.168.1.1'
      );
      expect(paused.status).toBe('PAUSED');
      expect(paused.paused_at).toBeDefined();

      // Resume
      const resumed = await campaignService.resumeCampaign(
        orgAId,
        testCampaignId,
        userAdminAId,
        '192.168.1.1'
      );
      expect(resumed.status).toBe('IN_PROGRESS');
      expect(resumed.paused_at).toBeNull();
    });

    it('adjusts concurrency dynamically during campaign execution', async () => {
      const updated = await campaignService.setConcurrency(
        orgAId,
        testCampaignId,
        userAdminAId,
        { concurrency: 8 },
        '192.168.1.1'
      );

      expect(updated.concurrency).toBe(8);

      const logs = await auditRepository.listByOrg(orgAId, 5);
      const concurrencyLog = logs.find((l) => l.action === 'CAMPAIGN_CONCURRENCY_CHANGED');
      expect(concurrencyLog).toBeDefined();
    });

    it('configures daily calling window', async () => {
      const updated = await campaignService.setCallingWindow(
        orgAId,
        testCampaignId,
        userAdminAId,
        {
          enableDailyHardStop: true,
          dailyStopTime: 19,
          dailyStopTimezone: 'Asia/Kolkata',
          enableDailyAutoStart: true,
          dailyStartTime: 10,
          dailyStartTimezone: 'Asia/Kolkata',
        },
        '192.168.1.1'
      );

      expect(updated.calling_window).toBeDefined();
      const windowObj = typeof updated.calling_window === 'string'
        ? JSON.parse(updated.calling_window)
        : updated.calling_window;
      expect(windowObj.dailyStopTime).toBe(19);
    });

    it('adds phone numbers to rotation pool and toggles active state', async () => {
      const poolItem = await campaignService.addNumberToPool(
        orgAId,
        testCampaignId,
        userAdminAId,
        phoneAId,
        '192.168.1.1'
      );

      expect(poolItem).toBeDefined();
      expect(poolItem.phone_number_id).toBe(phoneAId);
      expect(poolItem.is_active).toBe(true);

      const poolList = await campaignService.getNumberPool(orgAId, testCampaignId);
      expect(poolList.length).toBeGreaterThan(0);

      // Toggle active to false
      const toggled = await campaignService.setNumberActive(orgAId, testCampaignId, phoneAId, false);
      expect(toggled).toBe(true);
    });

    it('retries failed contacts safely without creating duplicate contacts', async () => {
      const retryResult = await campaignService.retryContacts(
        orgAId,
        testCampaignId,
        userAdminAId,
        {
          retryStrategy: 'all',
          maxRetries: 3,
          failureReasons: ['no-answer', 'busy', 'failed'],
        },
        '192.168.1.1'
      );

      expect(retryResult.retriedReasons).toEqual(['no-answer', 'busy', 'failed']);
      expect(retryResult.maxRetries).toBe(3);

      // Verify contact count has not duplicated
      const count = await campaignService.listContacts(orgAId, testCampaignId, {});
      expect(count.total).toBe(3);
    });

    it('fetches live campaign status from provider', async () => {
      const live = await campaignService.getLiveStatus(orgAId, testCampaignId);
      expect(live).toBeDefined();
      expect(live.campaignId).toBeDefined();
      expect(live.status).toBeDefined();
    });

    it('syncs provider results using cursor pagination and updates aggregate counters', async () => {
      // Mock line in provider
      const campaign = await campaignService.getCampaign(orgAId, testCampaignId);
      const lines = mockProvider.campaignLines.get(campaign.provider_campaign_id || '') || [];
      if (lines.length > 0) {
        lines[0].callStatus = 'completed';
        lines[0].duration = 45;
        lines[0].callId = 'mock-call-999';
      }

      const syncResult = await campaignService.syncResults(orgAId, testCampaignId, {
        pageSize: 10,
      });

      expect(syncResult).toBeDefined();
      expect(syncResult.lines.length).toBeGreaterThan(0);

      // Check that local contact was updated with duration and callId
      const contacts = await campaignService.listContacts(orgAId, testCampaignId, {});
      const matched = contacts.contacts.find((c) => c.normalized_phone_number === '+14155551001');
      if (matched) {
        expect(matched.status).toBe('COMPLETED');
        expect(matched.duration_seconds).toBe(45);
        expect(matched.provider_call_id).toBe('mock-call-999');
      }
    });

    it('exports campaign contacts to CSV format', async () => {
      const csv = await campaignService.exportContactsCsv(orgAId, testCampaignId);
      expect(csv).toBeDefined();
      expect(csv).toContain('id,phone_number,status,attempts,failure_reason,duration_seconds,created_at,completed_at');
      expect(csv).toContain('+14155551001');
      expect(csv).toContain('+14155551002');
    });

    it('cancels campaign safely', async () => {
      const canceled = await campaignService.cancelCampaign(
        orgAId,
        testCampaignId,
        userAdminAId,
        '192.168.1.1'
      );

      expect(canceled.status).toBe('CANCELED');
      expect(canceled.completed_at).toBeDefined();
    });
  });

  // ============================================================
  // 3. MULTI-TENANT ISOLATION TESTS
  // ============================================================
  describe('Multi-Tenant Isolation Tests (Org A vs Org B)', () => {
    let orgACampaignId: string;

    beforeAll(async () => {
      const camp = await campaignService.createCampaign(orgAId, userAdminAId, {
        name: 'Org A Secret Campaign',
        agentId: agentAId,
        phoneNumberId: phoneAId,
      });
      orgACampaignId = camp.id;
    });

    it('prevents Org B from retrieving Org A campaign', async () => {
      await expect(campaignService.getCampaign(orgBId, orgACampaignId)).rejects.toThrow();
    });

    it('prevents Org B from updating Org A campaign', async () => {
      await expect(
        campaignService.updateCampaign(orgBId, orgACampaignId, userAdminBId, { name: 'Hacked' })
      ).rejects.toThrow();
    });

    it('prevents Org B from importing contacts into Org A campaign', async () => {
      await expect(
        campaignService.addContacts(orgBId, orgACampaignId, userAdminBId, {
          contacts: [{ phone_number: '+14155559999' }],
        })
      ).rejects.toThrow();
    });

    it('prevents Org B from starting Org A campaign', async () => {
      await expect(
        campaignService.startCampaign(orgBId, orgACampaignId, userAdminBId)
      ).rejects.toThrow();
    });

    it('prevents Org B from exporting Org A campaign contacts', async () => {
      await expect(
        campaignService.exportContactsCsv(orgBId, orgACampaignId)
      ).rejects.toThrow();
    });

    it('prevents Org A from creating a campaign using Org B voice agent', async () => {
      await expect(
        campaignService.createCampaign(orgAId, userAdminAId, {
          name: 'Cross Tenant Agent Attack',
          agentId: agentBId, // Agent belongs to Org B!
          phoneNumberId: phoneAId,
        })
      ).rejects.toThrow(/Voice agent not found or does not belong to your organization/);
    });

    it('prevents Org A from creating a campaign using Org B phone number', async () => {
      await expect(
        campaignService.createCampaign(orgAId, userAdminAId, {
          name: 'Cross Tenant Phone Attack',
          agentId: agentAId,
          phoneNumberId: phoneBId, // Phone belongs to Org B!
        })
      ).rejects.toThrow(/Caller phone number not found or does not belong to your organization/);
    });
  });

  // ============================================================
  // 4. RBAC PERMISSIONS TESTS
  // ============================================================
  describe('RBAC Campaign Permissions Enforcement', () => {
    it('verifies MAIN_ADMIN and ORG_ADMIN have all campaign permissions', () => {
      const orgAdminCtx: OrgContext = {
        organizationId: orgAId,
        userId: userAdminAId,
        role: 'ORG_ADMIN',
        permissions: [
          'CAMPAIGN_VIEW',
          'CAMPAIGN_CREATE',
          'CAMPAIGN_MANAGE',
          'CAMPAIGN_DISPATCH',
          'CAMPAIGN_RETRY',
          'CAMPAIGN_EXPORT',
        ],
        user: {
          id: userAdminAId,
          email: 'admin@org-a.com',
          name: 'Org A Admin',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        organization: {
          id: orgAId,
          name: 'Org A',
          slug: 'org-a',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_VIEW')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_CREATE')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_MANAGE')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_DISPATCH')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_RETRY')).toBe(true);
      expect(hasPermission(orgAdminCtx, 'CAMPAIGN_EXPORT')).toBe(true);
    });

    it('allows EMPLOYEE with CAMPAIGN_VIEW but restricts unauthorized operations', () => {
      const employeeCtx: OrgContext = {
        organizationId: orgAId,
        userId: userEmployeeAId,
        role: 'EMPLOYEE',
        permissions: ['CAMPAIGN_VIEW', 'CAMPAIGN_DISPATCH'],
        user: {
          id: userEmployeeAId,
          email: 'emp@org-a.com',
          name: 'Org A Employee',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        organization: {
          id: orgAId,
          name: 'Org A',
          slug: 'org-a',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      expect(hasPermission(employeeCtx, 'CAMPAIGN_VIEW')).toBe(true);
      expect(hasPermission(employeeCtx, 'CAMPAIGN_DISPATCH')).toBe(true);

      expect(hasPermission(employeeCtx, 'CAMPAIGN_CREATE')).toBe(false);
      expect(hasPermission(employeeCtx, 'CAMPAIGN_MANAGE')).toBe(false);
      expect(hasPermission(employeeCtx, 'CAMPAIGN_RETRY')).toBe(false);
      expect(hasPermission(employeeCtx, 'CAMPAIGN_EXPORT')).toBe(false);

      expect(() => requirePermission(employeeCtx, 'CAMPAIGN_EXPORT')).toThrow(AuthorizationError);
    });
  });
});
