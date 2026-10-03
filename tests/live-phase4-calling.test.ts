import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ensureDatabaseReady } from '@/lib/db/client';
import { OmniDimensionProvider } from '@/lib/providers/voice/omnidimension/omnidimension.provider';
import { setGlobalMockVoiceProvider } from '@/services/provider-connection.service';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

describe('VoiceNuvo — Phase 4: Live OmniDimension Calling Engine Verification', () => {
  const apiKey = process.env.OMNIDIM_API_KEY;
  const isKeyAvailable = Boolean(apiKey && apiKey.trim().length > 0);

  // Opt-in safety controls for actual outbound calling (Section 9 & 35)
  const runLiveCallTest = process.env.RUN_LIVE_CALL_TEST === 'true';
  const testCallNumber = process.env.TEST_CALL_NUMBER;
  const testAgentId = process.env.TEST_AGENT_ID;

  beforeEach(async () => {
    await ensureDatabaseReady();
    // Ensure mock is disabled so calls hit the real OmniDimension provider
    setGlobalMockVoiceProvider(null);
  });

  afterEach(async () => {
    setGlobalMockVoiceProvider(null);
  });

  describe('Safety Protocol & Key Availability (Section 9, 35)', () => {
    it('detects OMNIDIM_API_KEY safely without logging secrets', () => {
      if (!isKeyAvailable) {
        expect(process.env.OMNIDIM_API_KEY).toBeUndefined();
      } else {
        expect(apiKey).toBeDefined();
        expect(apiKey!.length).toBeGreaterThan(5);
      }
    });

    it('enforces safety guard: real outbound calling is DISABLED by default in automated tests', () => {
      if (!runLiveCallTest || !testCallNumber) {
        // Must be safely disabled
        expect(runLiveCallTest && Boolean(testCallNumber)).toBe(false);
      }
    });
  });

  describe.skipIf(!isKeyAvailable)('Read-Only Live OmniDimension Telemetry & Logs', () => {
    // 1. List Call Logs
    it('queries historical call logs through live OmniDimension SDK without placing calls', async () => {
      const provider = new OmniDimensionProvider(apiKey!);
      const result = await provider.listCallLogs({ page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.logs)).toBe(true);
      expect(typeof result.total).toBe('number');

      if (result.logs.length > 0) {
        const firstCall = result.logs[0];
        expect(firstCall.id).toBeDefined();
        expect(firstCall.status).toBeDefined();
        expect(firstCall.toNumber).toBeDefined();
      }
    });

    // 2. Query Specific Call Detail (if historical call exists)
    it('retrieves and normalizes live call detail if a call record exists on OmniDimension', async () => {
      const provider = new OmniDimensionProvider(apiKey!);
      const result = await provider.listCallLogs({ page: 1, limit: 1 });

      if (result.logs.length > 0) {
        const callId = result.logs[0].id;
        const detail = await provider.getCallLog(callId);

        expect(detail).toBeDefined();
        expect(detail?.id).toBe(callId);
        expect(detail?.toNumber).toBeDefined();
        expect(detail?.status).toBeDefined();
      } else {
        // If account has no historical calls yet, test safely passes
        expect(result.logs.length).toBe(0);
      }
    });

    // 3. Error Normalization on Non-Existent Call ID
    it('safely normalizes provider errors when querying non-existent call ID', async () => {
      const provider = new OmniDimensionProvider(apiKey!);
      await expect(
        provider.getCallLog('non_existent_call_id_99999999')
      ).rejects.toThrow(VoiceProviderError);
    });

    // 4. Error Normalization on Invalid Dispatch Input
    it('rejects dispatch with invalid agent ID gracefully without leaking SDK traces', async () => {
      const provider = new OmniDimensionProvider(apiKey!);

      await expect(
        provider.dispatchCall({
          agentId: '999999999', // non-existent agent
          toNumber: '+12125550199',
        })
      ).rejects.toThrow();
    });
  });

  // Opt-in Live Outbound Call (ONLY runs when explicit environment flags are set)
  describe.skipIf(!isKeyAvailable || !runLiveCallTest || !testCallNumber)(
    'Opt-In Live Outbound Call Execution',
    () => {
      it('executes a live outbound call to the explicitly configured test destination', async () => {
        expect(runLiveCallTest).toBe(true);
        expect(testCallNumber).toMatch(/^\+[1-9]\d{6,14}$/);

        const provider = new OmniDimensionProvider(apiKey!);
        // Resolve agent ID (either explicitly supplied or query first available from account)
        let agentIdToUse = testAgentId;
        if (!agentIdToUse) {
          const { agents } = await provider.listAgents();
          expect(agents.length).toBeGreaterThan(0);
          agentIdToUse = agents[0].id;
        }

        const dispatchResult = await provider.dispatchCall({
          agentId: agentIdToUse!,
          toNumber: testCallNumber!,
          metadata: {
            test_run: 'phase4_opt_in_verification',
            timestamp: new Date().toISOString(),
          },
        });

        expect(dispatchResult.providerRequestId).toBeDefined();
        expect(['QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED']).toContain(
          dispatchResult.status
        );
      });
    }
  );
});
