import { z } from 'zod';

export const createTopUpOrderSchema = z.object({
  amountMinor: z.number().int().min(50000, 'Minimum top-up is ₹500 (50,000 paise)'),
});

export const createSubscriptionOrderSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
  billingInterval: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID required'),
  razorpayOrderId: z.string().min(1, 'Razorpay order ID required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay payment ID required'),
  razorpaySignature: z.string().min(1, 'Razorpay signature required'),
});

export const updateWalletSettingsSchema = z.object({
  lowBalanceThresholdMinor: z.number().int().min(0).optional(),
  autoTopupEnabled: z.boolean().optional(),
  autoTopupThresholdMinor: z.number().int().min(0).optional(),
  autoTopupAmountMinor: z.number().int().min(0).optional(),
});

export const updateBillingCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  businessLegalName: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  isGstRegistered: z.boolean().default(false),
  placeOfSupply: z.string().optional().nullable(),
  billingAddress: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      country: z.string().optional(),
    })
    .default({}),
});

export const createPlanSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  description: z.string().optional().nullable(),
  monthly_price_minor: z.number().int().min(0),
  annual_price_minor: z.number().int().min(0),
  included_minutes: z.number().int().min(0).default(0),
  included_credits_minor: z.number().int().min(0).default(0),
  max_users: z.number().int().min(1).default(5),
  max_agents: z.number().int().min(1).default(2),
  max_campaigns: z.number().int().min(1).default(5),
  max_monthly_calls: z.number().int().min(1).default(1000),
  max_concurrency: z.number().int().min(1).default(2),
  features: z.array(z.string()).default([]),
});

export const createPlanPriceSchema = z.object({
  billing_interval: z.enum(['MONTHLY', 'YEARLY']),
  price_minor: z.number().int().min(0),
});

export const createPricingRuleSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  usage_type: z.enum(['VOICE_OUTBOUND', 'VOICE_INBOUND', 'BULK_CAMPAIGN']),
  unit_price_minor: z.number().int().min(0),
  billing_unit: z.enum(['SECOND', 'MINUTE']).default('MINUTE'),
  rounding_policy: z
    .enum(['PER_SECOND', 'PER_MINUTE_ROUNDED_UP', 'PER_MINUTE_EXACT'])
    .default('PER_MINUTE_ROUNDED_UP'),
  minimum_charge_minor: z.number().int().min(0).default(0),
  tax_rate_percent: z.number().min(0).default(18.0),
});
