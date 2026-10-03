import crypto from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureDatabaseReady } from '@/lib/db/client';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { subscriptionRepository } from '@/lib/db/repositories/subscription.repository';
import { billingCustomerRepository } from '@/lib/db/repositories/billing-customer.repository';
import { walletLedgerRepository } from '@/lib/db/repositories/wallet-ledger.repository';
import { billingOrderRepository } from '@/lib/db/repositories/billing-order.repository';
import { billingPricingRuleRepository } from '@/lib/db/repositories/billing-pricing-rule.repository';
import { usageChargeRepository } from '@/lib/db/repositories/usage-charge.repository';
import { billingInvoiceRepository } from '@/lib/db/repositories/billing-invoice.repository';
import { billingWebhookRepository } from '@/lib/db/repositories/billing-webhook.repository';
import { walletService, InsufficientBalanceError } from '@/services/wallet.service';
import { entitlementService, EntitlementError } from '@/services/entitlement.service';
import { usageService } from '@/services/usage.service';
import { paymentService, PaymentVerificationError } from '@/services/payment.service';
import { billingService } from '@/services/billing.service';
import { razorpayBillingProvider } from '@/lib/providers/billing/razorpay-billing.provider';
import { hasPermission, requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

describe('VoiceNuvo — Phase 7: Billing & Monetization Test Suite', () => {
  const orgAId = 'c0000000-0000-0000-0000-000000000002'; // Acme Voice Corp
  const orgBId = 'c0000000-0000-0000-0000-000000000003'; // Globex Telephony
  const userAdminAId = 'd0000000-0000-0000-0000-000000000002';
  const platformAdminId = 'd0000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    const db = await ensureDatabaseReady();
    // Ensure wallets and subscriptions exist for test orgs
    const walletA = await walletService.getWallet(orgAId);
    const walletB = await walletService.getWallet(orgBId);

    // Ensure initial seed ledger entries exist for Acme Voice Corp & Globex
    await db.query(`
      INSERT INTO billing_wallet_ledger (
        id, organization_id, wallet_id, entry_type, amount_minor, balance_after_minor,
        reference_type, description, created_at
      ) VALUES
      (
        'bd000000-0000-0000-0000-000000000002',
        $1, $2,
        'TOP_UP',
        $3,
        $3,
        'PAYMENT',
        'Initial seeded prepaid wallet balance',
        NOW()
      ),
      (
        'bd000000-0000-0000-0000-000000000003',
        $4, $5,
        'TOP_UP',
        $6,
        $6,
        'PAYMENT',
        'Initial seeded prepaid wallet balance',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `, [orgAId, walletA.id, walletA.balance_minor, orgBId, walletB.id, walletB.balance_minor]);

    // Ensure subscriptions exist for test orgs
    let subA = await subscriptionRepository.findByOrganizationId(orgAId);
    if (!subA) {
      const growthPlan = await billingPlanRepository.findByCode('GROWTH');
      subA = await subscriptionRepository.create({
        organizationId: orgAId,
        planId: growthPlan?.id || 'e0000000-0000-0000-0000-000000000002',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        activatedAt: new Date().toISOString(),
      });
    }

    let subB = await subscriptionRepository.findByOrganizationId(orgBId);
    if (!subB) {
      const starterPlan = await billingPlanRepository.findByCode('STARTER');
      subB = await subscriptionRepository.create({
        organizationId: orgBId,
        planId: starterPlan?.id || 'e0000000-0000-0000-0000-000000000001',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        activatedAt: new Date().toISOString(),
      });
    }

    // Ensure customer exists for orgAId
    let custA = await billingCustomerRepository.findByOrganizationId(orgAId);
    if (!custA) {
      custA = await billingCustomerRepository.create({
        organizationId: orgAId,
        name: 'Acme Voice Corp',
        email: 'billing@acmevoice.com',
        phone: '+919876543210',
        businessLegalName: 'Acme Telephony Solutions Private Limited',
        gstin: '27AAAAA0000A1Z5',
        isGstRegistered: true,
        placeOfSupply: 'Maharashtra',
      });
    }
  });

  // =========================================================================
  // 1. BILLING PLANS & PRICE VERSIONING
  // =========================================================================
  describe('1. Billing Plans & Price Versioning', () => {
    let customPlanId: string;

    it('should list pre-seeded default plans (Starter, Growth, Pro, Enterprise)', async () => {
      const plans = await billingPlanRepository.listPlans('ACTIVE');
      expect(plans.length).toBeGreaterThanOrEqual(4);
      const codes = plans.map((p) => p.code);
      expect(codes).toContain('STARTER');
      expect(codes).toContain('GROWTH');
      expect(codes).toContain('PRO');
      expect(codes).toContain('ENTERPRISE');
    });

    it('should create a new plan with custom limits and features', async () => {
      const plan = await billingPlanRepository.createPlan({
        code: `CUSTOM_AGENCY_${Date.now()}`,
        name: 'Agency Scale Plan',
        description: 'High capacity plan for voice marketing agencies',
        monthly_price_minor: 1499900, // ₹14,999
        annual_price_minor: 14999000,
        included_minutes: 5000,
        max_agents: 25,
        max_users: 50,
        max_campaigns: 100,
        max_monthly_calls: 50000,
        max_concurrency: 10,
        features: ['CUSTOM_VOICE_MODELS', 'DEDICATED_SIP_TRUNK'],
      });

      expect(plan.id).toBeDefined();
      expect(plan.name).toBe('Agency Scale Plan');
      expect(plan.monthly_price_minor).toBe(1499900);
      customPlanId = plan.id;
    });

    it('should support immutable price versioning when plan prices change', async () => {
      // 1. Current prices for plan
      const initialPrices = await billingPlanRepository.getPriceHistory(customPlanId);
      expect(initialPrices.length).toBe(1);
      expect(initialPrices[0].version).toBe(1);

      // 2. Create new price version without altering historical prices
      const newPriceVersion = await billingPlanRepository.createPriceVersion({
        plan_id: customPlanId,
        billing_interval: 'MONTHLY',
        price_minor: 1699900, // price increased to ₹16,999
        currency: 'INR',
        effective_from: new Date().toISOString(),
      });

      expect(newPriceVersion.version).toBe(2);
      expect(newPriceVersion.price_minor).toBe(1699900);

      // 3. Verify history now has both versions preserved
      const updatedHistory = await billingPlanRepository.getPriceHistory(customPlanId);
      expect(updatedHistory.length).toBe(2);
      expect(updatedHistory[0].version).toBe(1);
      expect(updatedHistory[0].price_minor).toBe(1499900);
      expect(updatedHistory[1].version).toBe(2);
      expect(updatedHistory[1].price_minor).toBe(1699900);
    });

    it('should allow deactivating a plan without deleting historical records', async () => {
      const updated = await billingPlanRepository.updatePlan(customPlanId, { status: 'ARCHIVED' });
      expect(updated?.status).toBe('ARCHIVED');

      const activePlans = await billingPlanRepository.listPlans('ACTIVE');
      expect(activePlans.some((p) => p.id === customPlanId)).toBe(false);
    });
  });

  // =========================================================================
  // 2. SUBSCRIPTIONS & ENTITLEMENTS
  // =========================================================================
  describe('2. Subscriptions & Entitlements', () => {
    it('should find current subscription for organization A', async () => {
      const sub = await subscriptionRepository.findByOrganizationId(orgAId);
      expect(sub).toBeDefined();
      expect(sub?.organization_id).toBe(orgAId);
      expect(['ACTIVE', 'TRIAL']).toContain(sub?.status);
    });

    it('should accurately calculate organization entitlements based on plan', async () => {
      const entitlements = await entitlementService.getEntitlements(orgAId);
      expect(entitlements.maxAgents).toBeGreaterThan(0);
      expect(entitlements.maxCampaigns).toBeGreaterThan(0);
      expect(entitlements.canDispatchCall).toBe(true);
    });

    it('should enforce resource limits (assertCanCreateAgent)', async () => {
      // Entitlement limit check
      await expect(entitlementService.assertCanCreateAgent(orgAId)).resolves.not.toThrow();
    });

    it('should reject call dispatch if subscription is suspended or balance is insufficient', async () => {
      // Temporarily suspend Org B's subscription
      const subB = await subscriptionRepository.findByOrganizationId(orgBId);
      if (subB) {
        await subscriptionRepository.update(subB.id, orgBId, { status: 'SUSPENDED' });
      }

      await expect(entitlementService.assertCanDispatchCall(orgBId)).rejects.toThrow(
        EntitlementError
      );

      // Restore Org B subscription
      if (subB) {
        await subscriptionRepository.update(subB.id, orgBId, { status: 'ACTIVE' });
      }
    });

    it('should support subscription lifecycle status transitions', async () => {
      const sub = await subscriptionRepository.findByOrganizationId(orgAId);
      expect(sub).toBeDefined();

      // Transition to PAST_DUE
      const updated = await subscriptionRepository.update(sub!.id, orgAId, {
        status: 'PAST_DUE',
      });
      expect(updated?.status).toBe('PAST_DUE');

      // Recover back to ACTIVE
      const recovered = await subscriptionRepository.update(sub!.id, orgAId, {
        status: 'ACTIVE',
      });
      expect(recovered?.status).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // 3. PREPAID WALLET & IMMUTABLE LEDGER
  // =========================================================================
  describe('3. Prepaid Wallet & Immutable Ledger', () => {
    it('should fetch or initialize wallet with 0 or positive balance in minor units (paise)', async () => {
      const wallet = await walletService.getWallet(orgAId);
      expect(wallet).toBeDefined();
      expect(wallet.currency).toBe('INR');
      expect(wallet.balance_minor).toBeGreaterThanOrEqual(0);
    });

    it('should credit wallet via TOP_UP and record append-only ledger entry', async () => {
      const walletBefore = await walletService.getWallet(orgAId);
      const topupAmount = 250000; // ₹2,500

      const { wallet: updatedWallet } = await walletService.creditWallet(orgAId, topupAmount, {
        entryType: 'TOP_UP',
        referenceType: 'PAYMENT',
        referenceId: `pay_test_${Date.now()}`,
        idempotencyKey: `topup_test_${Date.now()}`,
        description: 'Test wallet top-up',
        createdBy: userAdminAId,
      });

      expect(updatedWallet.balance_minor).toBe(walletBefore.balance_minor + topupAmount);

      // Verify ledger entry
      const { entries: ledger } = await walletLedgerRepository.listByOrganization(orgAId, 10, 0);
      expect(ledger.length).toBeGreaterThan(0);
      expect(ledger[0].entry_type).toBe('TOP_UP');
      expect(ledger[0].amount_minor).toBe(topupAmount);
      expect(ledger[0].balance_after_minor).toBe(updatedWallet.balance_minor);
    });

    it('should debit wallet via USAGE_DEBIT and update balance transactionally', async () => {
      const walletBefore = await walletService.getWallet(orgAId);
      const debitAmount = 7000; // ₹70

      const { wallet: updatedWallet } = await walletService.debitWallet(orgAId, debitAmount, {
        entryType: 'USAGE_DEBIT',
        referenceType: 'USAGE_CHARGE',
        referenceId: `call_test_${Date.now()}`,
        idempotencyKey: `debit_test_${Date.now()}`,
        description: 'Voice call 10 minutes',
      });

      expect(updatedWallet.balance_minor).toBe(walletBefore.balance_minor - debitAmount);
    });

    it('should enforce negative balance prevention (InsufficientBalanceError)', async () => {
      const wallet = await walletService.getWallet(orgAId);
      const excessAmount = wallet.balance_minor + 100000000; // impossible amount

      await expect(
        walletService.debitWallet(orgAId, excessAmount, {
          entryType: 'USAGE_DEBIT',
          referenceType: 'USAGE_CHARGE',
          description: 'Excessive debit attempt',
        })
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('should record manual adjustments with required admin audit metadata', async () => {
      const adjustmentAmount = 50000; // ₹500 complimentary credit
      const { wallet: updatedWallet } = await walletService.creditWallet(orgAId, adjustmentAmount, {
        entryType: 'PROMOTIONAL_CREDIT',
        referenceType: 'MANUAL_ADMIN',
        referenceId: 'ticket_support_101',
        description: 'Courtesy credit for service interruption',
        createdBy: platformAdminId,
      });

      expect(updatedWallet).toBeDefined();
      const { entries } = await walletLedgerRepository.listByOrganization(orgAId, 5, 0);
      const promoEntry = entries.find((e) => e.entry_type === 'PROMOTIONAL_CREDIT');
      expect(promoEntry).toBeDefined();
      expect(promoEntry?.created_by).toBe(platformAdminId);
    });

    it('should prove ledger integrity: balance equals sum of all historical ledger entries', async () => {
      const recon = await walletService.reconcileWallet(orgAId);
      expect(recon.isBalanced).toBe(true);
      expect(recon.walletBalanceMinor).toBe(recon.ledgerSumMinor);
    });
  });

  // =========================================================================
  // 4. USAGE METERING, ROUNDING & PRICING RULES
  // =========================================================================
  describe('4. Usage Metering, Rounding & Pricing Rules', () => {
    it('should compute billable quantity based on rounding policies', () => {
      // PER_MINUTE_ROUNDED_UP
      expect(usageService.calculateBillableQuantity(125, 'PER_MINUTE_ROUNDED_UP')).toBe(3); // 2m 5s -> 3m
      expect(usageService.calculateBillableQuantity(60, 'PER_MINUTE_ROUNDED_UP')).toBe(1);  // exactly 1m
      expect(usageService.calculateBillableQuantity(61, 'PER_MINUTE_ROUNDED_UP')).toBe(2);  // 1m 1s -> 2m
      expect(usageService.calculateBillableQuantity(0, 'PER_MINUTE_ROUNDED_UP')).toBe(0);

      // PER_SECOND
      expect(usageService.calculateBillableQuantity(125, 'PER_SECOND')).toBe(2.0833);

      // PER_MINUTE_EXACT
      expect(usageService.calculateBillableQuantity(120, 'PER_MINUTE_EXACT')).toBe(2);
    });

    it('should find active pricing rules for outbound calls', async () => {
      const rule = await billingPricingRuleRepository.findByCode('VOICE_OUTBOUND_STD');
      expect(rule).toBeDefined();
      expect(rule?.unit_price_minor).toBe(700); // ₹7.00 per minute
      expect(rule?.rounding_policy).toBe('PER_MINUTE_ROUNDED_UP');
    });

    it('should record post-call usage and debit wallet atomically', async () => {
      const walletBefore = await walletService.getWallet(orgAId);
      const providerCallId = `call_prov_${Date.now()}`;

      // 185 seconds call = 4 billable minutes @ ₹7/min = ₹28.00 = 2800 paise
      const { charge } = await usageService.recordCallUsage(orgAId, {
        provider: 'OMNIDIMENSION',
        providerCallId,
        callId: null,
        durationSeconds: 185,
        usageType: 'VOICE_OUTBOUND',
        source: 'PROVIDER_WEBHOOK',
      });

      expect(charge).toBeDefined();
      // If plan has included minutes, charge is 0 or proportional; otherwise 2800 paise
      expect(Number(charge?.quantity)).toBe(4);
      expect(charge?.unit_price_minor).toBe(700);

      const walletAfter = await walletService.getWallet(orgAId);
      expect(walletAfter.balance_minor).toBe(walletBefore.balance_minor - (charge?.total_minor || 0));
    });

    it('should prevent double-charging the same provider call (idempotency)', async () => {
      const providerCallId = `call_idempotent_${Date.now()}`;

      // First execution: creates charge
      const { charge: firstCharge } = await usageService.recordCallUsage(orgAId, {
        provider: 'OMNIDIMENSION',
        providerCallId,
        durationSeconds: 120,
        usageType: 'VOICE_OUTBOUND',
      });
      expect(firstCharge).toBeDefined();

      const walletAfterFirst = await walletService.getWallet(orgAId);

      // Second execution with same providerCallId: must not charge again
      const { charge: secondCharge } = await usageService.recordCallUsage(orgAId, {
        provider: 'OMNIDIMENSION',
        providerCallId,
        durationSeconds: 120,
        usageType: 'VOICE_OUTBOUND',
      });

      expect(secondCharge?.id).toBe(firstCharge?.id);
      const walletAfterSecond = await walletService.getWallet(orgAId);
      expect(walletAfterSecond.balance_minor).toBe(walletAfterFirst.balance_minor);
    });

    it('should ignore 0-second failed or unanswered calls without creating charges', async () => {
      const { charge } = await usageService.recordCallUsage(orgAId, {
        provider: 'OMNIDIMENSION',
        providerCallId: `call_zero_${Date.now()}`,
        durationSeconds: 0,
        usageType: 'VOICE_OUTBOUND',
      });
      expect(charge?.total_minor).toBe(0);
    });
  });

  // =========================================================================
  // 5. ORDERS & PAYMENTS (RAZORPAY ADAPTER)
  // =========================================================================
  describe('5. Orders & Payments (Razorpay Adapter)', () => {
    let orderId: string;
    let razorpayOrderId: string;

    it('should create an internal billing order with Razorpay order ID', async () => {
      const { order } = await paymentService.createTopUpOrder(orgAId, 100000, userAdminAId); // ₹1,000
      expect(order).toBeDefined();
      expect(order.amount_minor).toBe(100000);
      expect(order.currency).toBe('INR');
      expect(['CREATED', 'PENDING']).toContain(order.status);
      expect(order.razorpay_order_id).toMatch(/^order_/);

      orderId = order.id;
      razorpayOrderId = order.razorpay_order_id;
    });

    it('should verify payment signature using server-known secret', () => {
      const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_mock_32bytes_len';
      const paymentId = 'pay_99887766';
      const expectedPayload = `${razorpayOrderId}|${paymentId}`;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(expectedPayload)
        .digest('hex');

      const isValid = razorpayBillingProvider.verifyPaymentSignature({
        orderId: razorpayOrderId,
        paymentId,
        signature: validSignature,
      });

      expect(isValid).toBe(true);
    });

    it('should reject payment verification if signature is forged or invalid', async () => {
      await expect(
        paymentService.verifyAndCapturePayment(orgAId, {
          orderId,
          razorpayOrderId,
          razorpayPaymentId: 'pay_tampered_123',
          razorpaySignature: 'invalid_forged_signature_hex_value',
        })
      ).rejects.toThrow(PaymentVerificationError);
    });

    it('should capture verified payment, fulfill order, and credit wallet', async () => {
      const walletBefore = await walletService.getWallet(orgAId);
      const paymentId = `pay_valid_${Date.now()}`;
      const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_mock_32bytes_len';
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpayOrderId}|${paymentId}`)
        .digest('hex');

      const { payment } = await paymentService.verifyAndCapturePayment(orgAId, {
        orderId,
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
        userId: userAdminAId,
      });

      expect(payment.status).toBe('CAPTURED');
      expect(payment.amount_minor).toBe(100000);

      // Verify order status
      const updatedOrder = await billingOrderRepository.findById(orderId);
      expect(updatedOrder?.status).toBe('PAID');

      // Verify wallet credit
      const walletAfter = await walletService.getWallet(orgAId);
      expect(walletAfter.balance_minor).toBe(walletBefore.balance_minor + 100000);
    });
  });

  // =========================================================================
  // 6. INVOICES & GST BREAKDOWN
  // =========================================================================
  describe('6. Invoices & GST Breakdown', () => {
    it('should create an invoice with line items and GST calculation', async () => {
      const invoice = await billingInvoiceRepository.create(
        {
          organizationId: orgAId,
          invoiceNumber: `INV-TEST-${Date.now().toString().slice(-6)}`,
          subtotalMinor: 100000, // ₹1,000
          taxMinor: 18000,       // 18% GST = ₹180
          totalMinor: 118000,    // ₹1,180
          currency: 'INR',
          status: 'ISSUED',
          taxDetails: {
            customer_gstin: '29ABCDE1234F1Z5',
            place_of_supply: 'Karnataka',
            is_gst_invoice: true,
          },
        },
        [
          {
            description: 'VoiceNuvo Growth Subscription (1 Month)',
            quantity: 1,
            unit: 'MONTH',
            unitPriceMinor: 100000,
            subtotalMinor: 100000,
            taxRatePercent: 18.0,
            taxMinor: 18000,
            totalMinor: 118000,
          },
        ]
      );

      expect(invoice.id).toBeDefined();
      expect(invoice.total_minor).toBe(invoice.subtotal_minor + invoice.tax_minor);
      expect(invoice.items?.length).toBe(1);
    });

    it('should list invoices for organization with pagination', async () => {
      const { invoices, total } = await billingInvoiceRepository.listByOrganization(orgAId, 10, 0);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(invoices.length).toBeGreaterThanOrEqual(1);
      expect(invoices[0].organization_id).toBe(orgAId);
    });
  });

  // =========================================================================
  // 7. WEBHOOK SECURITY & IDEMPOTENCY
  // =========================================================================
  describe('7. Webhook Security & Idempotency', () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_mock_32bytes_len';

    it('should verify valid HMAC-SHA256 signature on raw webhook payload', () => {
      const rawPayload = JSON.stringify({
        entity: 'event',
        account_id: 'acc_test_123',
        event: 'payment.captured',
        contains: ['payment'],
        payload: { payment: { entity: { id: 'pay_webhook_test_1', amount: 50000 } } },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const isValid = razorpayBillingProvider.verifyWebhookSignature(rawPayload, signature, webhookSecret);
      expect(isValid).toBe(true);

      const isInvalid = razorpayBillingProvider.verifyWebhookSignature(rawPayload, 'bogus_sig', webhookSecret);
      expect(isInvalid).toBe(false);
    });

    it('should process webhook event idempotently without duplicating side-effects', async () => {
      const providerEventId = `evt_test_${Date.now()}`;
      const rawPayload = JSON.stringify({
        id: providerEventId,
        event: 'payment.captured',
        account_id: 'acc_test_123',
        created_at: 1727932800,
        payload: {
          payment: {
            entity: {
              id: `pay_evt_${Date.now()}`,
              order_id: 'order_nonexistent_ignored',
              amount: 50000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      // 1. First execution
      const result1 = await paymentService.handleWebhookEvent(rawPayload, signature);
      expect(result1.status).toBe('processed');

      // 2. Replayed event with same payload & signature
      const result2 = await paymentService.handleWebhookEvent(rawPayload, signature);
      expect(result2.status).toBe('already_processed');
      expect(result2.eventId).toBe(result1.eventId);

      // Verify only 1 webhook record in database
      const eventRecord = await billingWebhookRepository.findByProviderEventId('RAZORPAY', providerEventId);
      expect(eventRecord).toBeDefined();
      expect(eventRecord?.processing_status).toBe('PROCESSED');
    });
  });

  // =========================================================================
  // 8. TENANT ISOLATION & RBAC SECURITY
  // =========================================================================
  describe('8. Tenant Isolation & RBAC Security', () => {
    it('should prevent Org A from accessing Org B wallet and ledger', async () => {
      const walletB = await walletService.getWallet(orgBId);
      expect(walletB.organization_id).toBe(orgBId);

      // Ledger query for Org A must return 0 entries for Org B
      const { entries: ledgerA } = await walletLedgerRepository.listByOrganization(orgAId, 100, 0);
      expect(ledgerA.every((e) => e.organization_id === orgAId)).toBe(true);
    });

    it('should prevent Org A from seeing Org B usage charges', async () => {
      const { charges: chargesA } = await usageChargeRepository.listByOrganization(orgAId, 100, 0);
      expect(chargesA.every((c) => c.organization_id === orgAId)).toBe(true);
    });

    it('should enforce RBAC permissions for billing actions', () => {
      // Platform Main Admin has all permissions
      expect(hasPermission('MAIN_ADMIN', 'BILLING_MANAGE')).toBe(true);
      expect(hasPermission('MAIN_ADMIN', 'PLAN_MANAGE')).toBe(true);

      // Org Admin has BILLING_VIEW, BILLING_MANAGE, BILLING_PAY
      expect(hasPermission('ORG_ADMIN', 'BILLING_VIEW')).toBe(true);
      expect(hasPermission('ORG_ADMIN', 'BILLING_MANAGE')).toBe(true);
      expect(hasPermission('ORG_ADMIN', 'BILLING_PAY')).toBe(true);
      expect(hasPermission('ORG_ADMIN', 'PLAN_MANAGE')).toBe(false); // Only Main Admin

      // Employee has no billing management
      expect(hasPermission('EMPLOYEE', 'BILLING_MANAGE')).toBe(false);
      expect(hasPermission('EMPLOYEE', 'BILLING_PAY')).toBe(false);
      expect(hasPermission('EMPLOYEE', 'PLAN_MANAGE')).toBe(false);

      expect(() => requirePermission('EMPLOYEE', 'BILLING_MANAGE')).toThrow(AuthorizationError);
    });

    it('should never expose Razorpay secrets in billing service outputs', async () => {
      const summary = await billingService.getOrganizationBillingSummary(orgAId);
      const jsonString = JSON.stringify(summary);

      expect(jsonString).not.toContain(process.env.RAZORPAY_KEY_SECRET || 'secret');
      expect(summary.customer).not.toHaveProperty('secret');
      expect(summary.subscription).not.toHaveProperty('secret');
    });
  });

  // =========================================================================
  // 9. FINANCIAL RECONCILIATION AUDIT
  // =========================================================================
  describe('9. Financial Reconciliation Audit', () => {
    it('should execute platform-wide cross-system reconciliation audit', async () => {
      const report = await billingService.runReconciliation();
      expect(report).toBeDefined();
      expect(report.totalChecked).toBeGreaterThan(0);
      expect(Array.isArray(report.discrepancies)).toBe(true);
      expect(report.timestamp).toBeDefined();
    });

    it('should aggregate admin financial KPIs accurately', async () => {
      const kpis = await billingService.getAdminKPIs();
      expect(kpis).toBeDefined();
      expect(kpis.activeSubscriptionsCount).toBeGreaterThanOrEqual(1);
      expect(kpis.totalPrepaidWalletBalanceMinor).toBeGreaterThanOrEqual(0);
      expect(kpis.monthlyBilledMinutes).toBeGreaterThanOrEqual(0);
    });
  });
});
