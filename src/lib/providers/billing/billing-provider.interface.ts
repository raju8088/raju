/**
 * VoiceNuvo — Billing Provider Interface
 * Strict provider abstraction isolating payment gateway mechanics from CRM and Calling logic.
 */

export interface ProviderCustomerInput {
  name: string;
  email: string;
  contact?: string | null;
  notes?: Record<string, string>;
  gstin?: string | null;
}

export interface ProviderCustomerResult {
  id: string;
  name: string;
  email: string;
  contact?: string | null;
  gstin?: string | null;
}

export interface ProviderOrderInput {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface ProviderOrderResult {
  id: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface ProviderPaymentVerificationInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface ProviderSubscriptionInput {
  planId: string;
  customerId?: string | null;
  totalCount: number;
  quantity?: number;
  startAt?: number;
  notes?: Record<string, string>;
}

export interface ProviderSubscriptionResult {
  id: string;
  planId: string;
  status: string;
  currentStart?: number;
  currentEnd?: number;
  chargeAt?: number;
  shortUrl?: string;
}

export interface ProviderPaymentDetails {
  id: string;
  orderId?: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  method: string;
  email?: string;
  contact?: string;
  captured: boolean;
  createdAt: number;
}

export interface ProviderInvoiceInput {
  customerId: string;
  description: string;
  lineItems: Array<{
    name: string;
    amountMinor: number;
    currency?: string;
    quantity?: number;
  }>;
  expireByDays?: number;
  notes?: Record<string, string>;
}

export interface ProviderInvoiceResult {
  id: string;
  customerId: string;
  invoiceNumber: string;
  amountMinor: number;
  status: string;
  shortUrl?: string;
  pdfUrl?: string;
}

export interface BillingProvider {
  name: string;

  createCustomer(input: ProviderCustomerInput): Promise<ProviderCustomerResult>;
  createOrder(input: ProviderOrderInput): Promise<ProviderOrderResult>;
  verifyPaymentSignature(input: ProviderPaymentVerificationInput): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPaymentDetails>;
  createSubscription(input: ProviderSubscriptionInput): Promise<ProviderSubscriptionResult>;
  cancelSubscription(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<ProviderSubscriptionResult>;
  fetchSubscription(subscriptionId: string): Promise<ProviderSubscriptionResult>;
  createInvoice(input: ProviderInvoiceInput): Promise<ProviderInvoiceResult>;
  refundPayment(paymentId: string, amountMinor?: number, notes?: Record<string, string>): Promise<{ id: string; amountMinor: number; status: string }>;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
}
