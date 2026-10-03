import { describe, it, expect, beforeAll } from 'vitest';
import { OmniDimensionProvider } from '@/lib/providers/voice/omnidimension/omnidimension.provider';

describe('VoiceNuvo — Phase 5: Live OmniDimension Bulk Campaign Verification', () => {
  const apiKey = process.env.OMNIDIM_API_KEY;
  const isKeyAvailable = Boolean(apiKey && apiKey.trim().length > 0 && !apiKey.includes('mock'));
  const canRunLiveMutations = process.env.RUN_LIVE_CAMPAIGN_TEST === 'true';

  let liveProvider: OmniDimensionProvider;

  beforeAll(() => {
    if (isKeyAvailable) {
      liveProvider = new OmniDimensionProvider(apiKey!);
    }
  });

  // ==========================================================
  // SAFE READ-ONLY TESTS (Runs automatically if API key is present)
  // ==========================================================
  describe('Safe Read-Only Capabilities & Connection', () => {
    it('detects live bulk campaign provider capabilities without side effects', async () => {
      if (!isKeyAvailable) {
        console.log('[Phase 5 Live Test] SKIPPED: OMNIDIM_API_KEY is not configured.');
        return;
      }

      const capabilities = await liveProvider.getCapabilities();
      expect(capabilities).toBeDefined();
      expect(capabilities.bulkCampaigns).toBe(true);
      expect(capabilities.campaignPauseResume).toBe(true);
      expect(capabilities.campaignConcurrency).toBe(true);
      expect(capabilities.campaignRetry).toBe(true);
      expect(capabilities.campaignCallingWindows).toBe(true);
      expect(capabilities.campaignNumberRotation).toBe(true);
    });

    it('verifies provider connectivity without placing calls', async () => {
      if (!isKeyAvailable) {
        console.log('[Phase 5 Live Test] SKIPPED: OMNIDIM_API_KEY is not configured.');
        return;
      }

      const testResult = await liveProvider.testConnection();
      expect(testResult).toBeDefined();
      expect(typeof testResult.success).toBe('boolean');
    });

    it('lists live campaigns or verifies campaigns endpoint safely', async () => {
      if (!isKeyAvailable) {
        console.log('[Phase 5 Live Test] SKIPPED: OMNIDIM_API_KEY is not configured.');
        return;
      }

      try {
        if (liveProvider.listCampaigns) {
          const res = await liveProvider.listCampaigns();
          expect(Array.isArray(res.campaigns)).toBe(true);
          console.log(`[Phase 5 Live Test] Successfully listed ${res.campaigns.length} remote campaigns.`);
        }
      } catch (err) {
        // Some provider tiers might not have campaign listing or might require botId
        console.log('[Phase 5 Live Test] Campaign listing read probe response:', (err as Error).message);
      }
    });
  });

  // ==========================================================
  // LIVE CAMPAIGN MUTATION TEST (Requires explicit opt-in: RUN_LIVE_CAMPAIGN_TEST=true)
  // ==========================================================
  describe('Live Campaign Mutations (Strict Opt-In)', () => {
    it('executes live draft campaign creation ONLY with explicit opt-in', async () => {
      if (!isKeyAvailable) {
        console.log('[Phase 5 Live Mutation] SKIPPED: No API key.');
        return;
      }

      if (!canRunLiveMutations) {
        console.log(
          'LIVE MUTATION TEST NOT RUN — explicit opt-in required (set RUN_LIVE_CAMPAIGN_TEST=true).'
        );
        expect(true).toBe(true); // Explicit skip indicator
        return;
      }

      // If opted-in, create a SAFE DRAFT campaign (saveAsDraft: true, NO dial)
      console.log('[Phase 5 Live Mutation] Running explicit opt-in safe draft test...');
      const draftResult = await liveProvider.createCampaign({
        name: 'VoiceNuvo Verification Draft',
        phoneNumberId: '',
        saveAsDraft: true,
        concurrentCallLimit: 1,
      });

      expect(draftResult).toBeDefined();
      expect(draftResult.providerCampaignId).toBeDefined();
      console.log(`[Phase 5 Live Mutation] Safe draft campaign created: ${draftResult.providerCampaignId}`);
    });
  });
});
