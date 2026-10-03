/**
 * VoiceNuvo — Phase 7 Billing & Monetization Types
 * Multi-tenant subscription, wallet, usage metering, invoices, and Razorpay contracts.
 */

export type BillingInterval = 'MONTHLY' | 'YEARLY';
export type BillingPlanStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: BillingPlanStatus;
  currency: string;
  monthly_price_minor: number; // in paise (e.g. ₹2,999 = 299900)
  annual_price_minor: number;
  included_minutes: number;
  included_credits_minor: number;
  max_users: number;
  max_agents: number;
  max_campaigns: number;
  max_monthly_calls: number;
  max_concurrency: number;
  features: string[];
  provider_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingPlanPrice {
  id: string;
  plan_id: string;
  version: number;
  billing_interval: BillingInterval;
  price_minor: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'SUSPENDED';

export interface OrganizationSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_price_id: string | null;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  plan_name?: string;
  plan_code?: string;
}

export interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface BillingCustomer {
  id: string;
  organization_id: string;
  razorpay_customer_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  billing_address: BillingAddress;
  business_legal_name: string | null;
  gstin: string | null;
  is_gst_registered: boolean;
  place_of_supply: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingWallet {
  id: string;
  organization_id: string;
  currency: string;
  balance_minor: number; // in paise
  reserved_minor: number;
  status: 'ACTIVE' | 'FROZEN';
  low_balance_threshold_minor: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_minor: number;
  auto_topup_amount_minor: number;
  created_at: string;
  updated_at: string;
}

export type WalletLedgerEntryType =
  | 'TOP_UP'
  | 'SUBSCRIPTION_CREDIT'
  | 'USAGE_DEBIT'
  | 'REFUND'
  | 'ADJUSTMENT'
  | 'PROMOTIONAL_CREDIT'
  | 'REVERSAL'
  | 'EXPIRATION';

export interface BillingWalletLedger {
  id: string;
  organization_id: string;
  wallet_id: string;
  entry_type: WalletLedgerEntryType;
  amount_minor: number; // positive for credit, negative for debit
  balance_after_minor: number;
  reference_type: 'PAYMENT' | 'USAGE_CHARGE' | 'SUBSCRIPTION' | 'INVOICE' | 'MANUAL_ADMIN' | 'PROMOTION';
  reference_id: string | null;
  idempotency_key: string | null;
  description: string;
  created_by: string | null;
  created_at: string;
}

export type OrderPurpose = 'SUBSCRIPTION' | 'WALLET_TOPUP' | 'INVOICE';
export type OrderStatus = 'CREATED' | 'PAID' | 'ATTEMPTED' | 'EXPIRED';

export interface BillingOrder {
  id: string;
  organization_id: string;
  razorpay_order_id: string;
  amount_minor: number;
  currency: string;
  purpose: OrderPurpose;
  status: OrderStatus;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET' | 'UNKNOWN';

export interface BillingPayment {
  id: string;
  organization_id: string;
  order_id: string | null;
  razorpay_payment_id: string;
  razorpay_order_id: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  signature: string | null;
  captured_at: string | null;
  failure_reason_safe: string | null;
  created_at: string;
}

export type UsageRoundingPolicy = 'PER_SECOND' | 'PER_MINUTE_ROUNDED_UP' | 'PER_MINUTE_EXACT';

export interface BillingPricingRule {
  id: string;
  code: string;
  name: string;
  usage_type: 'VOICE_OUTBOUND' | 'VOICE_INBOUND' | 'BULK_CAMPAIGN';
  unit_price_minor: number; // e.g. 700 paise = ₹7
  currency: string;
  billing_unit: 'SECOND' | 'MINUTE';
  rounding_policy: UsageRoundingPolicy;
  minimum_charge_minor: number;
  tax_rate_percent: number; // e.g. 18.00
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  organization_id: string;
  provider: string;
  provider_call_id: string | null;
  call_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  usage_type: string;
  quantity: number;
  unit: string;
  duration_seconds: number;
  source: string;
  event_time: string;
  idempotency_key: string;
  created_at: string;
}

export interface UsageCharge {
  id: string;
  organization_id: string;
  usage_event_id: string;
  pricing_rule_id: string | null;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  status: 'SETTLED' | 'WAIVED' | 'REFUNDED';
  wallet_ledger_id: string | null;
  created_at: string;
  // Joined fields
  call_duration_seconds?: number;
  call_direction?: string;
  destination_number?: string;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'EXPIRED';

export interface BillingInvoice {
  id: string;
  organization_id: string;
  invoice_number: string;
  razorpay_invoice_id: string | null;
  subscription_id: string | null;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_details: Record<string, unknown>;
  tax_details: Record<string, unknown>;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  items?: BillingInvoiceItem[];
}

export interface BillingInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_minor: number;
  subtotal_minor: number;
  tax_rate_percent: number;
  tax_minor: number;
  total_minor: number;
  created_at: string;
}

export type WebhookProcessingStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface BillingWebhookEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  signature_verified: boolean;
  processing_status: WebhookProcessingStatus;
  payload_hash: string | null;
  error_message_safe: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface AdminBillingKPIs {
  recordedRevenueMinor: number;
  activeSubscriptionsCount: number;
  trialSubscriptionsCount: number;
  pastDueSubscriptionsCount: number;
  canceledSubscriptionsCount: number;
  totalPrepaidWalletBalanceMinor: number;
  monthlyBilledMinutes: number;
  monthlyBilledCalls: number;
  failedPaymentsCount: number;
  reconciliationDiscrepanciesCount: number;
}

export interface OrgBillingSummary {
  subscription: OrganizationSubscription | null;
  plan: BillingPlan | null;
  wallet: BillingWallet | null;
  customer: BillingCustomer | null;
  includedMinutesTotal: number;
  includedMinutesUsed: number;
  includedMinutesRemaining: number;
  currentMonthUsageMinor: number;
  computedBillingStatus: 'BILLING_ACTIVE' | 'BILLING_GRACE' | 'BILLING_SUSPENDED' | 'BILLING_CANCELED';
}

export interface EntitlementLimits {
  canCreateUser: boolean;
  canCreateAgent: boolean;
  canCreateCampaign: boolean;
  canDispatchCall: boolean;
  maxUsers: number;
  currentUsers: number;
  maxAgents: number;
  currentAgents: number;
  maxCampaigns: number;
  currentCampaigns: number;
  walletBalanceMinor: number;
  includedMinutesRemaining: number;
  reason?: string;
}

export interface ReconciliationReport {
  timestamp: string;
  discrepancies: Array<{
    type: 'CALL_WITHOUT_USAGE' | 'USAGE_WITHOUT_CHARGE' | 'CHARGE_WITHOUT_LEDGER' | 'PAYMENT_AMOUNT_MISMATCH' | 'SUBSCRIPTION_STATE_MISMATCH';
    entityId: string;
    details: string;
  }>;
  totalChecked: number;
  discrepancyCount: number;
}
