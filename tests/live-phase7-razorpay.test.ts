import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { razorpayBillingProvider } from '@/lib/providers/billing/razorpay-billing.provider';

describe('VoiceNuvo — Phase 7: Live Razorpay Verification (Test Mode Opt-in)', () => {
  const isLiveTestOptIn = process.env.RUN_LIVE_RAZORPAY_TEST === 'true';
  const hasLiveCredentials =
    Boolean(process.env.RAZORPAY_KEY_ID) &&
    Boolean(process.env.RAZORPAY_KEY_SECRET) &&
    process.env.RAZORPAY_KEY_ID !== 'rzp_test_placeholder_key_id';

  if (!isLiveTestOptIn || !hasLiveCredentials) {
    it('LIVE RAZORPAY VERIFICATION NOT RUN — Requires RUN_LIVE_RAZORPAY_TEST=true with valid test keys', () => {
      console.log('------------------------------------------------------------');
      console.log('LIVE RAZORPAY VERIFICATION NOT RUN');
      console.log('Opt-in flag RUN_LIVE_RAZORPAY_TEST or RAZORPAY_KEY_ID/SECRET not configured.');
      console.log('Automated tests safely defaulted to mock verification to prevent unintended live API calls.');
      console.log('------------------------------------------------------------');
      expect(true).toBe(true);
    });
    return;
  }

  describe('Live Razorpay Test Mode Operations', () => {
    let liveOrderId: string;

    it('should connect to Razorpay test environment and create an authentic test order', async () => {
      const order = await razorpayBillingProvider.createOrder({
        amountMinor: 50000, // ₹500.00
        currency: 'INR',
        receipt: `test_rcpt_${Date.now()}`,
        notes: {
          environment: 'test',
          platform: 'voicenuvo',
        },
      });

      expect(order).toBeDefined();
      expect(order.id).toMatch(/^order_/);
      expect(order.amountMinor).toBe(50000);
      expect(order.currency).toBe('INR');
      expect(order.status).toBe('created');
      liveOrderId = order.id;
    });

    it('should accurately verify payment signature on live order with test HMAC secret', () => {
      const secret = process.env.RAZORPAY_KEY_SECRET!;
      const mockPaymentId = `pay_test_${Date.now()}`;
      const payload = `${liveOrderId}|${mockPaymentId}`;
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const verified = razorpayBillingProvider.verifyPaymentSignature({
        orderId: liveOrderId,
        paymentId: mockPaymentId,
        signature: validSig,
      });

      expect(verified).toBe(true);
    });

    it('should reject invalid payment signatures against the live secret', () => {
      const verified = razorpayBillingProvider.verifyPaymentSignature({
        orderId: liveOrderId,
        paymentId: 'pay_tampered_live',
        signature: 'bad_signature_string',
      });

      expect(verified).toBe(false);
    });

    it('should verify webhook payload signature with live webhook secret if set', () => {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET!;
      const testPayload = JSON.stringify({
        entity: 'event',
        event: 'payment.captured',
        order_id: liveOrderId,
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(testPayload)
        .digest('hex');

      const isSigValid = razorpayBillingProvider.verifyWebhookSignature(testPayload, signature);
      expect(isSigValid).toBe(true);
    });
  });
});
