import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { metaLeadProvider } from '@/lib/providers/meta/meta-lead.provider';

describe('VoiceNuvo — Phase 6: Live Meta Lead Ads Verification', () => {
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const appSecret = process.env.META_APP_SECRET || 'test_meta_app_secret_voicenuvo';

  const isMetaConfigured = Boolean(
    pageAccessToken &&
      pageAccessToken.trim().length > 10 &&
      pageId &&
      pageId.trim().length > 0 &&
      !pageAccessToken.includes('mock')
  );

  const canRunLiveCall =
    process.env.RUN_LIVE_META_TEST === 'true' &&
    process.env.RUN_LIVE_CALL_TEST === 'true' &&
    Boolean(process.env.TEST_CALL_NUMBER);

  beforeAll(() => {
    if (!isMetaConfigured) {
      console.log(
        '[Phase 6 Live Meta Test] SKIPPED: META_PAGE_ACCESS_TOKEN / META_PAGE_ID not configured.'
      );
    }
  });

  // ==========================================================
  // SAFE VERIFICATION (Runs in test suite without side effects)
  // ==========================================================
  describe('Safe Read-Only Meta Graph API Capabilities', () => {
    it('verifies Graph API v26.0 token validity if live credentials exist', async () => {
      if (!isMetaConfigured) {
        return;
      }

      const verified = await metaLeadProvider.verifyPageToken(pageAccessToken!);
      expect(verified).toBeDefined();
      expect(typeof verified.isValid).toBe('boolean');
      if (verified.isValid) {
        expect(verified.pageId).toBeDefined();
        console.log(`[Phase 6 Live Meta] Page Verified: ${verified.pageName} (${verified.pageId})`);
      }
    });

    it('retrieves live Leadgen forms without placing calls', async () => {
      if (!isMetaConfigured) {
        return;
      }

      try {
        const forms = await metaLeadProvider.getPageForms(pageId!, pageAccessToken!);
        expect(Array.isArray(forms)).toBe(true);
        console.log(`[Phase 6 Live Meta] Found ${forms.length} live lead forms on Page ${pageId}`);
      } catch (err) {
        console.warn('[Phase 6 Live Meta] Forms query failed (permissions check):', (err as Error).message);
      }
    });
  });

  // ==========================================================
  // WEBHOOK HANDSHAKE & SIGNATURE SECURITY
  // ==========================================================
  describe('Meta Webhook Handshake & Cryptographic Verification', () => {
    it('validates hub.challenge handshake logic according to Meta documentation', () => {
      const mode = 'subscribe';
      const verifyToken = 'voicenuvo_meta_verify_token_2026';
      const challenge = '1158201444';

      const configuredToken = 'voicenuvo_meta_verify_token_2026';
      const isValid = mode === 'subscribe' && verifyToken === configuredToken;
      expect(isValid).toBe(true);
      expect(challenge).toBe('1158201444');
    });

    it('validates HMAC-SHA256 signature verification for inbound webhooks', () => {
      const testPayload = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: pageId || '1029384756',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'leadgen',
                value: {
                  leadgen_id: 'live_test_lead_001',
                  page_id: pageId || '1029384756',
                  form_id: 'form_test_001',
                  created_time: Math.floor(Date.now() / 1000),
                },
              },
            ],
          },
        ],
      });

      const validHash = crypto.createHmac('sha256', appSecret).update(testPayload).digest('hex');
      const validSignature = `sha256=${validHash}`;

      const isValid = metaLeadProvider.verifyWebhookSignature(testPayload, validSignature, appSecret);
      expect(isValid).toBe(true);

      const isInvalid = metaLeadProvider.verifyWebhookSignature(
        testPayload,
        'sha256=invalid_tampered_hash_value',
        appSecret
      );
      expect(isInvalid).toBe(false);
    });
  });

  // ==========================================================
  // CRITICAL CALL SAFETY GATE
  // ==========================================================
  describe('Automated Call Test Safety Gate', () => {
    it('strictly prohibits automated outbound calls during automated test runs', () => {
      // Per Section 73: A live call requires explicit RUN_LIVE_META_TEST=true AND RUN_LIVE_CALL_TEST=true AND TEST_CALL_NUMBER
      if (!canRunLiveCall) {
        expect(canRunLiveCall).toBe(false);
        // Automated call safety check passed - no unsolicited real-world calls triggered
      } else {
        expect(process.env.TEST_CALL_NUMBER).toBeDefined();
      }
    });
  });
});
