import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { ensureDatabaseReady } from '@/lib/db/client';
import { MockVoiceProvider } from '@/lib/providers/voice/mock.provider';
import {
  setGlobalMockVoiceProvider,
  providerConnectionService,
} from '@/services/provider-connection.service';
import { callService } from '@/services/call.service';
import { callRepository } from '@/lib/db/repositories/call.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { phoneNumberRepository } from '@/lib/db/repositories/phone-number.repository';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import {
  normalizeCallStatus,
  normalizeCallDuration,
  canTransitionCallStatus,
  formatDuration,
} from '@/lib/providers/voice/call-normalizer';
import { dispatchCallSchema } from '@/lib/validation/call.schema';
import { hasPermission, requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { OrgContext } from '@/types';

describe('VoiceNuvo — Phase 4: Calling Engine Tests', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminAId = 'd0000000-0000-0000-0000-000000000002';
  const userAdminBId = 'd0000000-0000-0000-0000-000000000003';

  let mockProvider: MockVoiceProvider;
  let agentAId: string;
  let agentBId: string;
  let phoneAId: string;

  beforeAll(async () => {
    await ensureDatabaseReady();

    // Find or create agent for Org A
    let agentA = await voiceAgentRepository.findByProviderAgentId(orgAId, 'mock-agent-101');
    if (!agentA) {
      agentA = await voiceAgentRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerAgentId: 'mock-agent-101',
        name: 'Acme Support Agent',
      });
    }
    agentAId = agentA.id;

    // Find or create agent for Org B
    let agentB = await voiceAgentRepository.findByProviderAgentId(orgBId, 'mock-agent-202');
    if (!agentB) {
      agentB = await voiceAgentRepository.create({
        organizationId: orgBId,
        provider: 'OMNIDIMENSION',
        providerAgentId: 'mock-agent-202',
        name: 'Globex Sales Agent',
      });
    }
    agentBId = agentB.id;

    // Find or create phone number for Org A
    let phoneA = await phoneNumberRepository.findByPhoneNumber(orgAId, '+18005550199');
    if (!phoneA) {
      phoneA = await phoneNumberRepository.create({
        organizationId: orgAId,
        provider: 'OMNIDIMENSION',
        providerPhoneId: 'mock-pn-1',
        phoneNumber: '+18005550199',
        assignedAgentId: agentAId,
      });
    }
    phoneAId = phoneA.id;
  });

  beforeEach(async () => {
    mockProvider = new MockVoiceProvider();
    setGlobalMockVoiceProvider(mockProvider);

    // Ensure Org A & Org B have active provider connections
    await providerConnectionService.saveOrUpdateConnection(
      orgAId,
      userAdminAId,
      'test_key_org_a'
    );
    await providerConnectionService.saveOrUpdateConnection(
      orgBId,
      userAdminBId,
      'test_key_org_b'
    );
  });

  afterEach(async () => {
    setGlobalMockVoiceProvider(null);
  });

  // ==========================================
  // 1. Phone Normalization & Validation (Section 29)
  // ==========================================
  describe('Phone Validation & Form Validation', () => {
    it('accepts valid E.164 phone numbers with leading +', () => {
      const validCases = [
        '+12125551234',
        '+919876543210',
        '+442071838750',
        '+61291234567',
        '+81312345678',
      ];

      for (const num of validCases) {
        const result = dispatchCallSchema.safeParse({
          agentId: 'a0000000-0000-0000-0000-000000000001',
          toNumber: num,
        });
        expect(result.success, `Expected ${num} to be valid`).toBe(true);
      }
    });

    it('rejects invalid or non-E.164 numbers', () => {
      const invalidCases = [
        '12125551234', // missing leading +
        '+1', // too short
        '+123456789012345678', // too long (>16 chars)
        'not-a-number',
        '+1 (212) 555-1234', // spaces and parentheses
        '', // empty
      ];

      for (const num of invalidCases) {
        const result = dispatchCallSchema.safeParse({
          agentId: 'a0000000-0000-0000-0000-000000000001',
          toNumber: num,
        });
        expect(result.success, `Expected ${num} to fail`).toBe(false);
      }
    });

    it('validates call context and metadata size limits', () => {
      // Valid small context
      const valid = dispatchCallSchema.safeParse({
        agentId: 'a0000000-0000-0000-0000-000000000001',
        toNumber: '+12125551234',
        callContext: { customerName: 'Rahul', plan: 'Enterprise' },
        metadata: { leadId: 'lead_999' },
      });
      expect(valid.success).toBe(true);

      // Oversized context rejection (> 50 keys)
      const oversizedContext: Record<string, string> = {};
      for (let i = 0; i < 55; i++) {
        oversizedContext[`key_${i}`] = `value_${i}`;
      }

      const invalid = dispatchCallSchema.safeParse({
        agentId: 'a0000000-0000-0000-0000-000000000001',
        toNumber: '+12125551234',
        callContext: oversizedContext,
      });
      expect(invalid.success).toBe(false);
    });
  });

  // ==========================================
  // 2. Status Normalization & Lifecycle (Section 5, 14)
  // ==========================================
  describe('Status Normalization & Transition Safety', () => {
    it('normalizes provider status strings correctly', () => {
      expect(normalizeCallStatus('dispatched')).toBe('QUEUED');
      expect(normalizeCallStatus('queued')).toBe('QUEUED');
      expect(normalizeCallStatus('ringing')).toBe('RINGING');
      expect(normalizeCallStatus('in-progress')).toBe('IN_PROGRESS');
      expect(normalizeCallStatus('in_progress')).toBe('IN_PROGRESS');
      expect(normalizeCallStatus('completed')).toBe('COMPLETED');
      expect(normalizeCallStatus('ended')).toBe('COMPLETED');
      expect(normalizeCallStatus('failed')).toBe('FAILED');
      expect(normalizeCallStatus('busy')).toBe('BUSY');
      expect(normalizeCallStatus('no-answer')).toBe('NO_ANSWER');
      expect(normalizeCallStatus('no_answer')).toBe('NO_ANSWER');
      expect(normalizeCallStatus('canceled')).toBe('CANCELED');
      expect(normalizeCallStatus('unknown_provider_status')).toBe('PROVIDER_REPORTED');
      expect(normalizeCallStatus(undefined)).toBe('QUEUED');
    });

    it('enforces terminal status protection against downgrade', () => {
      // Progressions forward: allowed
      expect(canTransitionCallStatus('QUEUED', 'RINGING')).toBe(true);
      expect(canTransitionCallStatus('RINGING', 'IN_PROGRESS')).toBe(true);
      expect(canTransitionCallStatus('IN_PROGRESS', 'COMPLETED')).toBe(true);

      // Terminal state cannot be downgraded
      expect(canTransitionCallStatus('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(canTransitionCallStatus('COMPLETED', 'RINGING')).toBe(false);
      expect(canTransitionCallStatus('COMPLETED', 'QUEUED')).toBe(false);
      expect(canTransitionCallStatus('FAILED', 'RINGING')).toBe(false);
      expect(canTransitionCallStatus('BUSY', 'IN_PROGRESS')).toBe(false);

      // Same status update is allowed
      expect(canTransitionCallStatus('COMPLETED', 'COMPLETED')).toBe(true);
    });
  });

  // ==========================================
  // 3. Duration Normalization & Formatting (Section 22)
  // ==========================================
  describe('Duration Normalization', () => {
    it('prefers authoritative provider reported duration', () => {
      const dur = normalizeCallDuration({
        seconds: 125,
        startedAt: '2026-10-02T12:00:00Z',
        endedAt: '2026-10-02T12:02:10Z',
      });

      expect(dur.durationSeconds).toBe(125);
      expect(dur.durationSource).toBe('PROVIDER_REPORTED');
      expect(formatDuration(dur.durationSeconds)).toBe('2:05');
    });

    it('calculates duration server-side when provider duration is missing but timestamps exist', () => {
      const dur = normalizeCallDuration({
        startedAt: '2026-10-02T12:00:00Z',
        endedAt: '2026-10-02T12:01:30Z',
      });

      expect(dur.durationSeconds).toBe(90);
      expect(dur.durationSource).toBe('SERVER_CALCULATED');
      expect(formatDuration(dur.durationSeconds)).toBe('1:30');
    });

    it('falls back to UNKNOWN when duration and timestamps are unavailable', () => {
      const dur = normalizeCallDuration({});
      expect(dur.durationSeconds).toBe(0);
      expect(dur.durationSource).toBe('UNKNOWN');
      expect(formatDuration(dur.durationSeconds)).toBe('0:00');
    });

    it('formats durations cleanly into mm:ss format', () => {
      expect(formatDuration(45)).toBe('0:45');
      expect(formatDuration(130)).toBe('2:10');
      expect(formatDuration(3665)).toBe('61:05');
    });
  });

  // ==========================================
  // 4. Outbound Call Dispatch & Audit Logging (Section 6, 8, 31)
  // ==========================================
  describe('Outbound Call Dispatch', () => {
    it('successfully dispatches an outbound call and records audit logs', async () => {
      const result = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
          fromNumberId: phoneAId,
          callContext: { customerName: 'Alice', inquiry: 'Product Pricing' },
          metadata: { leadId: 'lead_abc_1' },
        },
        '127.0.0.1'
      );

      expect(result.id).toBeDefined();
      expect(result.destinationNumber).toBe('+12125550123');
      expect(result.status).toBe('QUEUED');
      expect(result.provider).toBe('OMNIDIMENSION');
      expect(result.providerRequestId).toBeDefined();
      expect(result.agentName).toBe('Acme Support Agent');

      // Verify call is stored in database
      const found = await callRepository.findById(result.id);
      expect(found).not.toBeNull();
      expect(found?.organization_id).toBe(orgAId);
      expect(found?.destination_number).toBe('+12125550123');

      // Verify audit logs were written
      const audits = await auditRepository.listByOrg(orgAId);
      const dispatchAudits = audits.filter((a) =>
        a.action.startsWith('CALL_DISPATCH')
      );
      expect(dispatchAudits.length).toBeGreaterThan(0);
      const acceptedAudit = dispatchAudits.find(
        (a) => a.action === 'CALL_DISPATCH_ACCEPTED'
      );
      expect(acceptedAudit).toBeDefined();
      // Ensure no raw keys or secrets in audit metadata
      expect(JSON.stringify(acceptedAudit?.metadata)).not.toContain('test_key');
    });

    it('rejects dispatch when agent does not exist or belongs to another org', async () => {
      // Org A attempts to use Org B's agent
      await expect(
        callService.dispatchCall(
          orgAId,
          userAdminAId,
          {
            agentId: agentBId,
            toNumber: '+12125550123',
          },
          '127.0.0.1'
        )
      ).rejects.toThrow(/Voice agent not found or does not belong to/i);
    });

    it('rejects dispatch when phone number belongs to another org', async () => {
      // Org B attempts to use Org A's phone number
      await expect(
        callService.dispatchCall(
          orgBId,
          userAdminBId,
          {
            agentId: agentBId,
            toNumber: '+12125550123',
            fromNumberId: phoneAId,
          },
          '127.0.0.1'
        )
      ).rejects.toThrow(/Phone number not found or does not belong to/i);
    });
  });

  // ==========================================
  // 5. Dispatch Idempotency (Section 10)
  // ==========================================
  describe('Dispatch Idempotency', () => {
    it('returns original call result and avoids multiple provider calls on repeated idempotency key', async () => {
      const idempotencyKey = 'unique-key-dispatch-12345';

      const firstCall = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
          idempotencyKey,
        },
        '127.0.0.1'
      );

      const secondCall = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
          idempotencyKey,
        },
        '127.0.0.1'
      );

      expect(secondCall.id).toBe(firstCall.id);
      expect(secondCall.providerRequestId).toBe(firstCall.providerRequestId);
      expect(new Date(secondCall.createdAt).toISOString()).toBe(new Date(firstCall.createdAt).toISOString());
    });
  });

  // ==========================================
  // 6. Post-Call Webhook & Idempotency (Section 13, 14, 15)
  // ==========================================
  describe('Post-Call Webhook Processing', () => {
    it('correlates incoming webhook by metadata.voicenuvo_call_id and updates call telemetry', async () => {
      // 1. Dispatch a call
      const dispatched = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
        },
        '127.0.0.1'
      );

      // 2. Deliver simulated OmniDimension post-call webhook
      const webhookPayload = {
        event: 'call.completed',
        call_id: 'omni-call-999',
        status: 'completed',
        duration: 185,
        started_at: '2026-10-02T14:00:00Z',
        ended_at: '2026-10-02T14:03:05Z',
        recording_url: 'https://cdn.omnidimension.ai/recordings/rec_999.wav',
        summary: 'Customer called to inquire about Enterprise plan pricing. Agreed to schedule demo.',
        sentiment: 'positive',
        sentiment_details: 'User expressed excitement about features and requested next steps.',
        extracted_variables: {
          budget: '$50k/year',
          interest: 'High',
          team_size: '25',
        },
        conversation: '<br/> Assistant: Hello! How can I assist you today?<br/> <br/> User: Hi, tell me about enterprise pricing.<br/> <br/> Assistant: Absolutely, our enterprise tier includes dedicated lines.',
        metadata: {
          voicenuvo_call_id: dispatched.id,
          org_id: orgAId,
        },
      };

      const result = await callService.processWebhook(webhookPayload);
      expect(result.matched).toBe(true);
      expect(result.callId).toBe(dispatched.id);
      expect(result.status).toBe('COMPLETED');

      // 3. Verify updated database record
      const updated = await callRepository.findById(dispatched.id);
      expect(updated?.status).toBe('COMPLETED');
      expect(updated?.duration_seconds).toBe(185);
      expect(updated?.duration_source).toBe('PROVIDER_REPORTED');
      expect(updated?.recording_url).toBe('https://cdn.omnidimension.ai/recordings/rec_999.wav');
      expect(updated?.recording_available).toBe(true);
      expect(updated?.summary).toContain('Enterprise plan pricing');
      expect(updated?.sentiment).toBe('positive');
      expect(updated?.extracted_variables).toEqual({
        budget: '$50k/year',
        interest: 'High',
        team_size: '25',
      });
      expect(updated?.transcript).toContain('Hello! How can I assist you today?');
    });

    it('safely handles duplicate webhook delivery without corrupting record or downgrading status', async () => {
      const dispatched = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
        },
        '127.0.0.1'
      );

      const firstWebhook = {
        call_id: 'omni-call-888',
        status: 'completed',
        duration: 90,
        metadata: { voicenuvo_call_id: dispatched.id },
      };

      await callService.processWebhook(firstWebhook);

      // Re-delivery of stale or duplicate webhook
      const duplicateWebhook = {
        call_id: 'omni-call-888',
        status: 'in-progress', // Stale in-progress event delivered late
        duration: 40,
        metadata: { voicenuvo_call_id: dispatched.id },
      };

      await callService.processWebhook(duplicateWebhook);

      // Record must maintain COMPLETED status and 90s duration
      const finalCall = await callRepository.findById(dispatched.id);
      expect(finalCall?.status).toBe('COMPLETED');
      expect(finalCall?.duration_seconds).toBe(90);
    });
  });

  // ==========================================
  // 7. Multi-Tenant Isolation (Section 17, 25)
  // ==========================================
  describe('Tenant Isolation', () => {
    it('prevents Org B from listing or viewing Org A calls', async () => {
      // 1. Org A dispatches a call
      const callA = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
        },
        '127.0.0.1'
      );

      // 2. Org B attempts to view Org A call directly
      await expect(
        callService.getCall(orgBId, callA.id, userAdminBId)
      ).rejects.toThrow('Call not found');

      // 3. Org B lists calls
      const orgBCalls = await callService.listCalls(orgBId, { page: 1, limit: 10 });
      const foundAInB = orgBCalls.calls.some((c) => c.id === callA.id);
      expect(foundAInB).toBe(false);

      // 4. Org A lists calls and sees its own call
      const orgACalls = await callService.listCalls(orgAId, { page: 1, limit: 10 });
      const foundAInA = orgACalls.calls.some((c) => c.id === callA.id);
      expect(foundAInA).toBe(true);
    });
  });

  // ==========================================
  // 8. RBAC & Permissions (Section 24)
  // ==========================================
  describe('RBAC Authorization', () => {
    const orgContextOrgAdmin: Pick<OrgContext, 'role' | 'permissions'> = {
      role: 'ORG_ADMIN',
      permissions: ['CALL_VIEW', 'CALL_DISPATCH', 'CALL_MANAGE'],
    };

    const orgContextEmployee: Pick<OrgContext, 'role' | 'permissions'> = {
      role: 'EMPLOYEE',
      permissions: ['CALL_VIEW', 'CALL_DISPATCH'],
    };

    const orgContextUnprivileged: Pick<OrgContext, 'role' | 'permissions'> = {
      role: 'EMPLOYEE',
      permissions: [],
    };

    it('allows ORG_ADMIN full CALL_VIEW, CALL_DISPATCH, and CALL_MANAGE', () => {
      expect(hasPermission(orgContextOrgAdmin, 'CALL_VIEW')).toBe(true);
      expect(hasPermission(orgContextOrgAdmin, 'CALL_DISPATCH')).toBe(true);
      expect(hasPermission(orgContextOrgAdmin, 'CALL_MANAGE')).toBe(true);
    });

    it('allows EMPLOYEE with granted permissions to view and dispatch calls', () => {
      expect(hasPermission(orgContextEmployee, 'CALL_VIEW')).toBe(true);
      expect(hasPermission(orgContextEmployee, 'CALL_DISPATCH')).toBe(true);
      expect(hasPermission(orgContextEmployee, 'CALL_MANAGE')).toBe(false);
    });

    it('rejects unprivileged users with 403 AuthorizationError', () => {
      expect(hasPermission(orgContextUnprivileged, 'CALL_VIEW')).toBe(false);
      expect(hasPermission(orgContextUnprivileged, 'CALL_DISPATCH')).toBe(false);

      expect(() => {
        requirePermission(orgContextUnprivileged, 'CALL_DISPATCH');
      }).toThrow(AuthorizationError);
    });
  });

  // ==========================================
  // 9. Secret Leak Protection (Section 2, 30, 31)
  // ==========================================
  describe('Secret Leak Prevention', () => {
    it('ensures call DTOs and API payloads never contain provider API keys or auth headers', async () => {
      const call = await callService.dispatchCall(
        orgAId,
        userAdminAId,
        {
          agentId: agentAId,
          toNumber: '+12125550123',
        },
        '127.0.0.1'
      );

      const jsonStr = JSON.stringify(call);
      expect(jsonStr).not.toContain('test_key');
      expect(jsonStr).not.toContain('Bearer');
      expect(jsonStr).not.toContain('apiKey');
      expect(jsonStr).not.toContain('api_key');
      expect(jsonStr).not.toContain('authorization');
    });
  });
});
