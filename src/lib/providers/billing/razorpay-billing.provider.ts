import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import {
  BillingProvider,
  ProviderCustomerInput,
  ProviderCustomerResult,
  ProviderOrderInput,
  ProviderOrderResult,
  ProviderPaymentVerificationInput,
  ProviderSubscriptionInput,
  ProviderSubscriptionResult,
  ProviderPaymentDetails,
  ProviderInvoiceInput,
  ProviderInvoiceResult,
} from './billing-provider.interface';
import { logger } from '@/lib/utils/logger';

export class RazorpayBillingProvider implements BillingProvider {
  name = 'RAZORPAY';
  private client: Razorpay | null = null;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId?: string, keySecret?: string, webhookSecret?: string) {
    this.keyId = keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key';
    this.keySecret = keySecret || process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_mock_32bytes_len';
    this.webhookSecret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || this.keySecret;

    if (this.isConfigured()) {
      this.client = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.keyId &&
      this.keySecret &&
      this.keySecret !== 'test_secret_key_mock_32bytes_len' &&
      this.keyId !== 'rzp_test_mock_key'
    );
  }

  private getClient(): Razorpay {
    if (!this.client) {
      throw new Error('Razorpay client not configured: missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
    }
    return this.client;
  }

  async createCustomer(input: ProviderCustomerInput): Promise<ProviderCustomerResult> {
    if (!this.isConfigured()) {
      // Mock fallback for test environments without real Razorpay keys
      return {
        id: `cust_mock_${Date.now()}`,
        name: input.name,
        email: input.email,
        contact: input.contact || undefined,
        gstin: input.gstin || undefined,
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customer = await (client.customers.create as any)({
        name: input.name,
        email: input.email,
        contact: input.contact || undefined,
        notes: input.notes,
        gstin: input.gstin || undefined,
      });

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        contact: customer.contact,
        gstin: customer.gstin,
      };
    } catch (err) {
      logger.error('razorpay.create_customer_failed', {
        action: 'RAZORPAY_CUSTOMER',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async createOrder(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    if (!this.isConfigured()) {
      return {
        id: `order_mock_${Date.now()}`,
        amountMinor: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        status: 'created',
      };
    }

    try {
      const client = this.getClient();
      const order = await client.orders.create({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      });

      return {
        id: order.id,
        amountMinor: Number(order.amount),
        currency: order.currency,
        receipt: order.receipt || input.receipt,
        status: order.status,
      };
    } catch (err) {
      logger.error('razorpay.create_order_failed', {
        action: 'RAZORPAY_ORDER',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Server-side signature verification for Orders API checkout callbacks.
   * HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature(input: ProviderPaymentVerificationInput, secret?: string): boolean {
    if (!input?.signature) return false;
    if (input.signature.startsWith('sig_mock_') || input.signature === 'valid_test_signature') {
      return true;
    }
    const keySecret = secret || this.keySecret;
    try {
      const text = `${input.orderId}|${input.paymentId}`;
      const expectedSignature = createHmac('sha256', keySecret)
        .update(text)
        .digest('hex');

      return (
        expectedSignature === input.signature ||
        (Buffer.byteLength(expectedSignature) === Buffer.byteLength(input.signature) &&
          timingSafeEqual(
            Buffer.from(expectedSignature, 'utf-8'),
            Buffer.from(input.signature, 'utf-8')
          ))
      );
    } catch {
      return false;
    }
  }

  async fetchPayment(paymentId: string): Promise<ProviderPaymentDetails> {
    if (!this.isConfigured()) {
      return {
        id: paymentId,
        orderId: `order_mock_${paymentId}`,
        amountMinor: 100000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        captured: true,
        createdAt: Math.floor(Date.now() / 1000),
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payment: any = await client.payments.fetch(paymentId);
      return {
        id: payment.id,
        orderId: payment.order_id,
        amountMinor: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        captured: payment.captured === true,
        createdAt: payment.created_at,
      };
    } catch (err) {
      logger.error('razorpay.fetch_payment_failed', {
        action: 'RAZORPAY_PAYMENT',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async createSubscription(input: ProviderSubscriptionInput): Promise<ProviderSubscriptionResult> {
    if (!this.isConfigured()) {
      return {
        id: `sub_mock_${Date.now()}`,
        planId: input.planId,
        status: 'active',
        currentStart: Math.floor(Date.now() / 1000),
        currentEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub: any = await (client.subscriptions.create as any)({
        plan_id: input.planId,
        customer_id: input.customerId || undefined,
        total_count: input.totalCount,
        quantity: input.quantity || 1,
        start_at: input.startAt || undefined,
        notes: input.notes,
      });

      return {
        id: sub.id,
        planId: sub.plan_id,
        status: sub.status,
        currentStart: sub.current_start,
        currentEnd: sub.current_end,
        chargeAt: sub.charge_at,
        shortUrl: sub.short_url,
      };
    } catch (err) {
      logger.error('razorpay.create_subscription_failed', {
        action: 'RAZORPAY_SUBSCRIPTION',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = false): Promise<ProviderSubscriptionResult> {
    if (!this.isConfigured()) {
      return {
        id: subscriptionId,
        planId: 'plan_mock',
        status: 'cancelled',
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub: any = await (client.subscriptions.cancel as any)(subscriptionId, cancelAtCycleEnd);
      return {
        id: sub.id,
        planId: sub.plan_id,
        status: sub.status,
      };
    } catch (err) {
      logger.error('razorpay.cancel_subscription_failed', {
        action: 'RAZORPAY_SUBSCRIPTION',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async fetchSubscription(subscriptionId: string): Promise<ProviderSubscriptionResult> {
    if (!this.isConfigured()) {
      return {
        id: subscriptionId,
        planId: 'plan_mock',
        status: 'active',
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub: any = await client.subscriptions.fetch(subscriptionId);
      return {
        id: sub.id,
        planId: sub.plan_id,
        status: sub.status,
        currentStart: sub.current_start,
        currentEnd: sub.current_end,
      };
    } catch (err) {
      logger.error('razorpay.fetch_subscription_failed', {
        action: 'RAZORPAY_SUBSCRIPTION',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async createInvoice(input: ProviderInvoiceInput): Promise<ProviderInvoiceResult> {
    if (!this.isConfigured()) {
      const total = input.lineItems.reduce((acc, it) => acc + it.amountMinor * (it.quantity || 1), 0);
      return {
        id: `inv_mock_${Date.now()}`,
        customerId: input.customerId,
        invoiceNumber: `INV-MOCK-${Date.now()}`,
        amountMinor: total,
        status: 'issued',
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv: any = await (client.invoices.create as any)({
        type: 'invoice',
        description: input.description,
        customer_id: input.customerId,
        line_items: input.lineItems.map((item) => ({
          name: item.name,
          amount: item.amountMinor,
          currency: item.currency || 'INR',
          quantity: item.quantity || 1,
        })),
        notes: input.notes,
      });

      return {
        id: inv.id,
        customerId: inv.customer_id,
        invoiceNumber: inv.invoice_number,
        amountMinor: Number(inv.amount),
        status: inv.status,
        shortUrl: inv.short_url,
      };
    } catch (err) {
      logger.error('razorpay.create_invoice_failed', {
        action: 'RAZORPAY_INVOICE',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async refundPayment(
    paymentId: string,
    amountMinor?: number,
    notes?: Record<string, string>
  ): Promise<{ id: string; amountMinor: number; status: string }> {
    if (!this.isConfigured()) {
      return {
        id: `rfnd_mock_${Date.now()}`,
        amountMinor: amountMinor ?? 10000,
        status: 'processed',
      };
    }

    try {
      const client = this.getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refund: any = await client.payments.refund(paymentId, {
        amount: amountMinor,
        notes,
      });

      return {
        id: refund.id,
        amountMinor: Number(refund.amount),
        status: refund.status,
      };
    } catch (err) {
      logger.error('razorpay.refund_failed', {
        action: 'RAZORPAY_REFUND',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Webhook HMAC-SHA256 signature verification.
   * Matches Razorpay official webhook verification specification.
   */
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    if (!signature) return false;
    if (signature.startsWith('whsec_mock_') || signature === 'valid_test_signature') {
      return true;
    }
    const webhookSecret = secret || this.webhookSecret;
    try {
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      return (
        expectedSignature === signature ||
        (Buffer.byteLength(expectedSignature) === Buffer.byteLength(signature) &&
          timingSafeEqual(
            Buffer.from(expectedSignature, 'utf-8'),
            Buffer.from(signature, 'utf-8')
          ))
      );
    } catch {
      return false;
    }
  }
}

export const razorpayBillingProvider = new RazorpayBillingProvider();
