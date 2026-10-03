import { ensureDatabaseReady } from '@/lib/db/client';
import { razorpayBillingProvider } from '@/lib/providers/billing/razorpay-billing.provider';
import { billingOrderRepository } from '@/lib/db/repositories/billing-order.repository';
import { billingPaymentRepository } from '@/lib/db/repositories/billing-payment.repository';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { subscriptionRepository } from '@/lib/db/repositories/subscription.repository';
import { billingCustomerRepository } from '@/lib/db/repositories/billing-customer.repository';
import { billingInvoiceRepository } from '@/lib/db/repositories/billing-invoice.repository';
import { billingWebhookRepository } from '@/lib/db/repositories/billing-webhook.repository';
import { walletService } from './wallet.service';
import { BillingOrder, BillingPayment, BillingInvoice, BillingInterval, PaymentMethod } from '@/types/billing';
import { logger } from '@/lib/utils/logger';

export class PaymentVerificationError extends Error {
  constructor(message = 'Payment verification failed: invalid signature or untrusted amount') {
    super(message);
    this.name = 'PaymentVerificationError';
  }
}

export class PaymentService {
  /**
   * Create Razorpay Checkout order for Prepaid Wallet Top-up
   */
  async createTopUpOrder(
    organizationId: string,
    amountMinor: number,
    userId: string
  ): Promise<{ order: BillingOrder; keyId: string }> {
    // Minimum top-up check (e.g. ₹500 = 50,000 paise) (Section 22)
    if (amountMinor < 50000) {
      throw new Error('Minimum wallet top-up is ₹500 (50,000 paise)');
    }

    const receipt = `topup_${organizationId.slice(0, 8)}_${Date.now()}`;
    const providerOrder = await razorpayBillingProvider.createOrder({
      amountMinor,
      currency: 'INR',
      receipt,
      notes: { organizationId, purpose: 'WALLET_TOPUP', createdBy: userId },
    });

    const order = await billingOrderRepository.create({
      organizationId,
      razorpayOrderId: providerOrder.id,
      amountMinor,
      currency: 'INR',
      purpose: 'WALLET_TOPUP',
      metadata: { receipt, createdBy: userId },
    });

    return {
      order,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key',
    };
  }

  /**
   * Create Razorpay Checkout order for Subscription activation/upgrade
   */
  async createSubscriptionOrder(
    organizationId: string,
    planId: string,
    billingInterval: BillingInterval = 'MONTHLY',
    userId: string
  ): Promise<{ order: BillingOrder; keyId: string }> {
    const plan = await billingPlanRepository.findById(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const amountMinor =
      billingInterval === 'YEARLY' ? plan.annual_price_minor : plan.monthly_price_minor;

    const receipt = `sub_${plan.code}_${Date.now()}`;
    const providerOrder = await razorpayBillingProvider.createOrder({
      amountMinor,
      currency: plan.currency,
      receipt,
      notes: { organizationId, planId, billingInterval, purpose: 'SUBSCRIPTION', createdBy: userId },
    });

    const order = await billingOrderRepository.create({
      organizationId,
      razorpayOrderId: providerOrder.id,
      amountMinor,
      currency: plan.currency,
      purpose: 'SUBSCRIPTION',
      metadata: { planId, billingInterval, receipt, createdBy: userId },
    });

    return {
      order,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key',
    };
  }

  /**
   * Verify and capture payment server-side with signature check & authoritative fetch (Sections 43, 44)
   */
  async verifyAndCapturePayment(
    organizationId: string,
    params: {
      orderId: string; // Internal or Razorpay order ID
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      userId?: string;
    }
  ): Promise<{ payment: BillingPayment; invoice: BillingInvoice }> {
    // 1. Validate signature server-side
    const isValidSignature = razorpayBillingProvider.verifyPaymentSignature({
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      signature: params.razorpaySignature,
    });

    if (!isValidSignature) {
      logger.error('payment.signature_verification_failed', {
        action: 'PAYMENT_VERIFY',
        organization: { id: organizationId },
        metadata: { razorpayOrderId: params.razorpayOrderId },
      });
      throw new PaymentVerificationError('Cryptographic payment signature mismatch');
    }

    // 2. Fetch authoritative payment details from provider (Section 43)
    const providerPayment = await razorpayBillingProvider.fetchPayment(params.razorpayPaymentId);

    // 3. Resolve internal order
    const order = await billingOrderRepository.findByRazorpayOrderId(params.razorpayOrderId);
    if (!order) {
      throw new Error(`Order not found for Razorpay order: ${params.razorpayOrderId}`);
    }

    if (order.organization_id !== organizationId) {
      throw new Error('Tenant mismatch on payment verification');
    }

    // Verify amounts match between order and payment
    if (order.amount_minor !== providerPayment.amountMinor) {
      throw new PaymentVerificationError(
        `Amount mismatch: order expected ${order.amount_minor}, provider reported ${providerPayment.amountMinor}`
      );
    }

    const db = await ensureDatabaseReady();

    return db.transaction(async (tx) => {
      // 4. Record payment record (idempotent ON CONFLICT)
      const payment = await billingPaymentRepository.create(
        {
          organizationId,
          orderId: order.id,
          razorpayPaymentId: params.razorpayPaymentId,
          razorpayOrderId: params.razorpayOrderId,
          amountMinor: providerPayment.amountMinor,
          currency: providerPayment.currency,
          status: 'CAPTURED',
          method: (providerPayment.method?.toUpperCase() as PaymentMethod) || 'CARD',
          signature: params.razorpaySignature,
          capturedAt: new Date(providerPayment.createdAt * 1000).toISOString(),
        },
        tx
      );

      // Update order status
      await billingOrderRepository.updateStatus(order.id, 'PAID', tx);

      // 5. Fulfillment based on purpose
      if (order.purpose === 'WALLET_TOPUP') {
        await walletService.creditWallet(
          organizationId,
          providerPayment.amountMinor,
          {
            entryType: 'TOP_UP',
            referenceType: 'PAYMENT',
            referenceId: payment.id,
            idempotencyKey: `topup_payment_${payment.id}`,
            description: `Prepaid wallet recharge via Razorpay (${providerPayment.method || 'online'})`,
            createdBy: params.userId,
          },
          tx
        );
      } else if (order.purpose === 'SUBSCRIPTION') {
        const planId = (order.metadata?.planId as string) || '';
        const billingInterval = ((order.metadata?.billingInterval as string) || 'MONTHLY') as BillingInterval;
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + (billingInterval === 'YEARLY' ? 365 : 30));

        const sub = await subscriptionRepository.findByOrganizationId(organizationId, tx);
        if (sub) {
          await subscriptionRepository.update(
            sub.id,
            organizationId,
            {
              plan_id: planId,
              status: 'ACTIVE',
              billing_interval: billingInterval,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              activated_at: now.toISOString(),
            },
            tx
          );
        } else {
          await subscriptionRepository.create(
            {
              organizationId,
              planId,
              status: 'ACTIVE',
              billingInterval,
              currentPeriodStart: now.toISOString(),
              currentPeriodEnd: periodEnd.toISOString(),
              activatedAt: now.toISOString(),
            },
            tx
          );
        }
      }

      // 6. Generate GST-compliant invoice
      const customer = await billingCustomerRepository.findByOrganizationId(organizationId, tx);
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Calculate GST (18% inclusive or forward)
      const taxRate = 18.00;
      const subtotalMinor = Math.round(providerPayment.amountMinor / 1.18);
      const taxMinor = providerPayment.amountMinor - subtotalMinor;

      const invoice = await billingInvoiceRepository.create(
        {
          organizationId,
          invoiceNumber,
          subtotalMinor,
          discountMinor: 0,
          taxMinor,
          totalMinor: providerPayment.amountMinor,
          currency: providerPayment.currency,
          status: 'PAID',
          paidAt: new Date().toISOString(),
          customerDetails: {
            name: customer?.name || 'Customer',
            email: customer?.email || '',
            gstin: customer?.gstin || null,
            businessLegalName: customer?.business_legal_name || null,
          },
          taxDetails: {
            taxRatePercent: taxRate,
            cgstMinor: Math.round(taxMinor / 2),
            sgstMinor: taxMinor - Math.round(taxMinor / 2),
            placeOfSupply: customer?.place_of_supply || 'Maharashtra',
          },
        },
        [
          {
            description:
              order.purpose === 'WALLET_TOPUP'
                ? 'Prepaid Voice Credits Top-up'
                : 'VoiceNuvo Platform Subscription',
            quantity: 1,
            unit: 'SERVICE',
            unitPriceMinor: subtotalMinor,
            subtotalMinor,
            taxRatePercent: taxRate,
            taxMinor,
            totalMinor: providerPayment.amountMinor,
          },
        ],
        tx
      );

      logger.info('payment.captured_and_settled', {
        action: 'PAYMENT_CAPTURED',
        organization: { id: organizationId },
        metadata: {
          paymentId: payment.id,
          amountMinor: providerPayment.amountMinor,
          invoiceNumber,
        },
      });

      return { payment, invoice };
    });
  }

  /**
   * Idempotent webhook event ingestion & processing (Sections 45, 46, 47, 48)
   */
  async handleWebhookEvent(
    rawBody: string,
    signature: string
  ): Promise<{ status: string; eventId?: string }> {
    // 1. Verify HMAC-SHA256 signature
    const isValid = razorpayBillingProvider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('razorpay.webhook_invalid_signature', { action: 'RAZORPAY_WEBHOOK_INVALID' });
      throw new Error('Invalid Razorpay webhook signature');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = JSON.parse(rawBody);
    const eventType = payload.event as string;
    const providerEventId = (payload.id as string) || (payload.account_id ? `${payload.account_id}_${payload.created_at || Date.now()}` : `evt_${Date.now()}`);

    // 2. Check webhook idempotency table
    const existing = await billingWebhookRepository.findByProviderEventId('RAZORPAY', providerEventId);
    if (existing && existing.processing_status === 'PROCESSED') {
      logger.info('razorpay.webhook_replay_ignored', {
        action: 'WEBHOOK_REPLAY',
        metadata: { providerEventId, eventType },
      });
      return { status: 'already_processed', eventId: existing.id };
    }

    const eventRecord = await billingWebhookRepository.create({
      provider: 'RAZORPAY',
      providerEventId,
      eventType,
      signatureVerified: true,
      processingStatus: 'PROCESSING',
    });

    try {
      // Handle events
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = payload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          const internalOrder = await billingOrderRepository.findByRazorpayOrderId(orderId);
          if (internalOrder && internalOrder.status !== 'PAID') {
            await this.verifyAndCapturePayment(internalOrder.organization_id, {
              orderId: internalOrder.id,
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentEntity.id,
              razorpaySignature: signature || 'valid_test_signature',
            });
          }
        }
      }

      await billingWebhookRepository.updateStatus(eventRecord.id, 'PROCESSED');
      return { status: 'processed', eventId: eventRecord.id };
    } catch (err) {
      await billingWebhookRepository.updateStatus(
        eventRecord.id,
        'FAILED',
        (err as Error).message
      );
      throw err;
    }
  }
}

export const paymentService = new PaymentService();
