-- 009_billing_monetization_phase7.sql
-- VoiceNuvo Phase 7: Multi-tenant Billing, Subscriptions, Razorpay, Wallet, Usage Metering, Invoices & Monetization

-- 1. Insert Phase 7 Billing Permissions
INSERT INTO permissions (id, key, description) VALUES
  ('a0000000-0000-0000-0000-000000000034', 'BILLING_VIEW', 'View organization billing, subscription, wallet balance, and invoices'),
  ('a0000000-0000-0000-0000-000000000035', 'BILLING_MANAGE', 'Manage subscription, change plan, configure auto top-up, and billing profile'),
  ('a0000000-0000-0000-0000-000000000036', 'BILLING_PAY', 'Initiate checkout orders, wallet top-ups, and invoice payments'),
  ('a0000000-0000-0000-0000-000000000037', 'BILLING_EXPORT', 'Export billing, usage, and invoice reports to CSV'),
  ('a0000000-0000-0000-0000-000000000038', 'PLAN_VIEW', 'View available subscription plans and pricing rules'),
  ('a0000000-0000-0000-0000-000000000039', 'PLAN_MANAGE', 'Platform-level creation and editing of subscription plans and pricing rules'),
  ('a0000000-0000-0000-0000-000000000040', 'USAGE_VIEW', 'View detailed voice call usage logs and charges')
ON CONFLICT (key) DO NOTHING;

-- Map permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MAIN_ADMIN'
  AND p.key IN (
    'BILLING_VIEW', 'BILLING_MANAGE', 'BILLING_PAY', 'BILLING_EXPORT',
    'PLAN_VIEW', 'PLAN_MANAGE', 'USAGE_VIEW'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ORG_ADMIN'
  AND p.key IN (
    'BILLING_VIEW', 'BILLING_MANAGE', 'BILLING_PAY', 'BILLING_EXPORT',
    'PLAN_VIEW', 'USAGE_VIEW'
  )
ON CONFLICT DO NOTHING;

-- 2. Billing Plans Table
CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    monthly_price_minor INTEGER NOT NULL DEFAULT 0,
    annual_price_minor INTEGER NOT NULL DEFAULT 0,
    included_minutes INTEGER NOT NULL DEFAULT 0,
    included_credits_minor INTEGER NOT NULL DEFAULT 0,
    max_users INTEGER NOT NULL DEFAULT 5,
    max_agents INTEGER NOT NULL DEFAULT 2,
    max_campaigns INTEGER NOT NULL DEFAULT 5,
    max_monthly_calls INTEGER NOT NULL DEFAULT 1000,
    max_concurrency INTEGER NOT NULL DEFAULT 2,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    provider_plan_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Billing Plan Prices Table (Plan price versioning & historical immutability)
CREATE TABLE IF NOT EXISTS billing_plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    price_minor INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Organization Subscriptions Table
CREATE TABLE IF NOT EXISTS organization_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES billing_plans(id),
    plan_price_id UUID REFERENCES billing_plan_prices(id),
    status VARCHAR(30) NOT NULL DEFAULT 'TRIAL',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    razorpay_subscription_id VARCHAR(100),
    razorpay_customer_id VARCHAR(100),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    canceled_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Billing Customers Table (Customer Profile & GST Details)
CREATE TABLE IF NOT EXISTS billing_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    razorpay_customer_id VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    business_legal_name VARCHAR(255),
    gstin VARCHAR(20),
    is_gst_registered BOOLEAN NOT NULL DEFAULT false,
    place_of_supply VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Billing Wallets Table (Prepaid Credits Vault)
CREATE TABLE IF NOT EXISTS billing_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    reserved_minor INTEGER NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    low_balance_threshold_minor INTEGER NOT NULL DEFAULT 50000,
    auto_topup_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_topup_threshold_minor INTEGER NOT NULL DEFAULT 50000,
    auto_topup_amount_minor INTEGER NOT NULL DEFAULT 100000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Billing Wallet Ledger Table (Append-only immutable financial ledger)
CREATE TABLE IF NOT EXISTS billing_wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES billing_wallets(id) ON DELETE CASCADE,
    entry_type VARCHAR(50) NOT NULL,
    amount_minor INTEGER NOT NULL,
    balance_after_minor INTEGER NOT NULL,
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    idempotency_key VARCHAR(255) UNIQUE,
    description TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Billing Orders Table (Internal payment orders tracking Razorpay checkouts)
CREATE TABLE IF NOT EXISTS billing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    purpose VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
    idempotency_key VARCHAR(255) UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Billing Payments Table
CREATE TABLE IF NOT EXISTS billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id UUID REFERENCES billing_orders(id) ON DELETE SET NULL,
    razorpay_payment_id VARCHAR(100) UNIQUE NOT NULL,
    razorpay_order_id VARCHAR(100),
    amount_minor INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(30) NOT NULL,
    method VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
    signature VARCHAR(255),
    captured_at TIMESTAMPTZ,
    failure_reason_safe TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Billing Pricing Rules Table (Configurable usage rates & rounding policies)
CREATE TABLE IF NOT EXISTS billing_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    usage_type VARCHAR(50) NOT NULL,
    unit_price_minor INTEGER NOT NULL DEFAULT 700,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    billing_unit VARCHAR(20) NOT NULL DEFAULT 'MINUTE',
    rounding_policy VARCHAR(50) NOT NULL DEFAULT 'PER_MINUTE_ROUNDED_UP',
    minimum_charge_minor INTEGER NOT NULL DEFAULT 0,
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Usage Events Table (Immutable call duration events from provider)
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_call_id VARCHAR(100),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    usage_type VARCHAR(50) NOT NULL DEFAULT 'VOICE_MINUTE',
    quantity NUMERIC(10,4) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'MINUTE',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(50) NOT NULL DEFAULT 'PROVIDER_COMPLETED',
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Usage Charges Table (Monetary charge calculated from usage event)
CREATE TABLE IF NOT EXISTS usage_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    usage_event_id UUID NOT NULL REFERENCES usage_events(id) ON DELETE CASCADE UNIQUE,
    pricing_rule_id UUID REFERENCES billing_pricing_rules(id),
    quantity NUMERIC(10,4) NOT NULL,
    unit_price_minor INTEGER NOT NULL,
    subtotal_minor INTEGER NOT NULL,
    tax_minor INTEGER NOT NULL DEFAULT 0,
    total_minor INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(30) NOT NULL DEFAULT 'SETTLED',
    wallet_ledger_id UUID REFERENCES billing_wallet_ledger(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Billing Invoices Table (GST & Tax Capable)
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    razorpay_invoice_id VARCHAR(100),
    subscription_id UUID REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
    subtotal_minor INTEGER NOT NULL,
    discount_minor INTEGER NOT NULL DEFAULT 0,
    tax_minor INTEGER NOT NULL DEFAULT 0,
    total_minor INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(30) NOT NULL DEFAULT 'PAID',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_at TIMESTAMPTZ,
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    customer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    tax_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Billing Invoice Items Table
CREATE TABLE IF NOT EXISTS billing_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
    unit VARCHAR(20) NOT NULL DEFAULT 'UNIT',
    unit_price_minor INTEGER NOT NULL,
    subtotal_minor INTEGER NOT NULL,
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    tax_minor INTEGER NOT NULL DEFAULT 0,
    total_minor INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Billing Webhook Events Table (Idempotent tracking of Razorpay webhooks)
CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    provider_event_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    payload_hash VARCHAR(64),
    error_message_safe TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE (provider, provider_event_id)
);

-- 16. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_billing_plans_status ON billing_plans(status);
CREATE INDEX IF NOT EXISTS idx_billing_plan_prices_plan ON billing_plan_prices(plan_id, version);
CREATE INDEX IF NOT EXISTS idx_org_subs_org ON organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subs_status ON organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_billing_customers_org ON billing_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_wallets_org ON billing_wallets(organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_org ON billing_wallet_ledger(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON billing_wallet_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_billing_orders_org ON billing_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_orders_rzp ON billing_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_org ON billing_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_rzp ON billing_payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_call ON usage_events(call_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider_call ON usage_events(provider, provider_call_id);
CREATE INDEX IF NOT EXISTS idx_usage_charges_org ON usage_charges(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_charges_event ON usage_charges(usage_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON billing_invoices(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_num ON billing_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_inv ON billing_invoice_items(invoice_id);

-- 17. Row Level Security (RLS)
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Plans & Pricing Rules are globally viewable by authenticated users, manageable by MAIN_ADMIN
CREATE POLICY billing_plans_policy ON billing_plans
    FOR ALL
    USING (
        is_main_admin() OR
        status = 'ACTIVE'
    );

CREATE POLICY billing_plan_prices_policy ON billing_plan_prices
    FOR ALL
    USING (
        is_main_admin() OR
        EXISTS (SELECT 1 FROM billing_plans WHERE id = plan_id AND status = 'ACTIVE')
    );

CREATE POLICY billing_pricing_rules_policy ON billing_pricing_rules
    FOR ALL
    USING (
        is_main_admin() OR
        is_active = true
    );

-- Organization-scoped policies
CREATE POLICY organization_subscriptions_policy ON organization_subscriptions
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_customers_policy ON billing_customers
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_wallets_policy ON billing_wallets
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_wallet_ledger_policy ON billing_wallet_ledger
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_orders_policy ON billing_orders
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_payments_policy ON billing_payments
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY usage_events_policy ON usage_events
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY usage_charges_policy ON usage_charges
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_invoices_policy ON billing_invoices
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY billing_invoice_items_policy ON billing_invoice_items
    FOR ALL
    USING (
        is_main_admin() OR
        invoice_id IN (SELECT id FROM billing_invoices WHERE organization_id IN (SELECT get_my_org_ids()))
    );

CREATE POLICY billing_webhook_events_policy ON billing_webhook_events
    FOR ALL
    USING (
        is_main_admin()
    );

-- 18. Pre-Seed Billing Plans
INSERT INTO billing_plans (
    id, code, name, description, status, currency,
    monthly_price_minor, annual_price_minor, included_minutes, included_credits_minor,
    max_users, max_agents, max_campaigns, max_monthly_calls, max_concurrency, features
) VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'STARTER',
    'Starter',
    'Essential voice automation for growing startups and boutique clinics',
    'ACTIVE',
    'INR',
    299900, -- ₹2,999/mo
    2999000, -- ₹29,990/yr (2 months free)
    500,
    350000,
    3,
    2,
    5,
    1000,
    2,
    '["Single voice agent", "Up to 500 included mins", "Standard calling engine", "Email support"]'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'GROWTH',
    'Growth',
    'High performance voice workflows and bulk campaigns for expanding teams',
    'ACTIVE',
    'INR',
    799900, -- ₹7,999/mo
    7999000, -- ₹79,990/yr
    1500,
    1050000,
    10,
    5,
    25,
    5000,
    5,
    '["5 Voice agents", "Up to 1,500 included mins", "Meta Lead Ads integration", "Bulk campaigns", "Priority queueing"]'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'PRO',
    'Pro',
    'Comprehensive call center automation with dedicated concurrency and deep CRM sync',
    'ACTIVE',
    'INR',
    1999900, -- ₹19,999/mo
    19999000, -- ₹199,990/yr
    5000,
    3500000,
    30,
    15,
    100,
    20000,
    15,
    '["15 Voice agents", "5,000 included mins", "High concurrency bulk caller", "Live sentiment analytics", "Dedicated support"]'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000004',
    'ENTERPRISE',
    'Enterprise',
    'Tailored infrastructure, custom LLM fine-tuning, SLA, and unlimited scale',
    'ACTIVE',
    'INR',
    4999900, -- ₹49,999/mo
    49999000, -- ₹499,990/yr
    15000,
    10500000,
    100,
    50,
    500,
    100000,
    50,
    '["Unlimited agents & campaigns", "15,000+ included mins", "Custom LLM prompts & voices", "24/7 SLA", "Custom billing terms"]'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

-- Pre-seed plan prices
INSERT INTO billing_plan_prices (plan_id, version, billing_interval, price_minor, currency)
SELECT id, 1, 'MONTHLY', monthly_price_minor, currency FROM billing_plans
ON CONFLICT DO NOTHING;

INSERT INTO billing_plan_prices (plan_id, version, billing_interval, price_minor, currency)
SELECT id, 1, 'YEARLY', annual_price_minor, currency FROM billing_plans
ON CONFLICT DO NOTHING;

-- 19. Pre-Seed Pricing Rules
INSERT INTO billing_pricing_rules (
    id, code, name, usage_type, unit_price_minor, currency,
    billing_unit, rounding_policy, minimum_charge_minor, tax_rate_percent, is_active
) VALUES
  (
    'f0000000-0000-0000-0000-000000000001',
    'VOICE_OUTBOUND_STD',
    'Standard Outbound Voice Call',
    'VOICE_OUTBOUND',
    700, -- ₹7.00 per minute
    'INR',
    'MINUTE',
    'PER_MINUTE_ROUNDED_UP',
    700,
    18.00,
    true
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'VOICE_INBOUND_STD',
    'Standard Inbound Voice Call',
    'VOICE_INBOUND',
    500, -- ₹5.00 per minute
    'INR',
    'MINUTE',
    'PER_MINUTE_ROUNDED_UP',
    500,
    18.00,
    true
  ),
  (
    'f0000000-0000-0000-0000-000000000003',
    'BULK_CAMPAIGN_STD',
    'Bulk Campaign Outbound Call',
    'BULK_CAMPAIGN',
    700, -- ₹7.00 per minute
    'INR',
    'MINUTE',
    'PER_MINUTE_ROUNDED_UP',
    700,
    18.00,
    true
  )
ON CONFLICT (code) DO NOTHING;

-- 20. Initialize Seed Organizations with Wallets and Active Subscriptions
-- 20. Initialize Seed Organizations with Wallets and Active Subscriptions (Only if demo orgs exist)
-- Acme Voice Corp (c0000000-0000-0000-0000-000000000002)
INSERT INTO billing_wallets (id, organization_id, balance_minor, low_balance_threshold_minor)
SELECT 'ba000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 250000, 50000
FROM organizations WHERE id = 'c0000000-0000-0000-0000-000000000002'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO organization_subscriptions (
    id, organization_id, plan_id, status, billing_interval,
    current_period_start, current_period_end, activated_at
)
SELECT
    'bb000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002', -- GROWTH Plan
    'ACTIVE',
    'MONTHLY',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW()
FROM organizations WHERE id = 'c0000000-0000-0000-0000-000000000002'
ON CONFLICT DO NOTHING;

INSERT INTO billing_customers (
    id, organization_id, name, email, phone, business_legal_name, gstin, is_gst_registered, place_of_supply
)
SELECT
    'bc000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002',
    'Acme Voice Corp',
    'billing@acmevoice.com',
    '+919876543210',
    'Acme Telephony Solutions Private Limited',
    '27AAAAA0000A1Z5',
    true,
    'Maharashtra'
FROM organizations WHERE id = 'c0000000-0000-0000-0000-000000000002'
ON CONFLICT (organization_id) DO NOTHING;

-- Globex Telephony (c0000000-0000-0000-0000-000000000003)
INSERT INTO billing_wallets (id, organization_id, balance_minor, low_balance_threshold_minor)
SELECT 'ba000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 100000, 50000
FROM organizations WHERE id = 'c0000000-0000-0000-0000-000000000003'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO organization_subscriptions (
    id, organization_id, plan_id, status, billing_interval,
    current_period_start, current_period_end, activated_at
)
SELECT
    'bb000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000001', -- STARTER Plan
    'ACTIVE',
    'MONTHLY',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW()
FROM organizations WHERE id = 'c0000000-0000-0000-0000-000000000003'
ON CONFLICT DO NOTHING;

-- Initial Seed Ledger Entries for Wallets (Only if wallet exists)
INSERT INTO billing_wallet_ledger (
    id, organization_id, wallet_id, entry_type, amount_minor, balance_after_minor,
    reference_type, description, created_at
)
SELECT
    'bd000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002',
    'ba000000-0000-0000-0000-000000000002',
    'TOP_UP',
    250000,
    250000,
    'PAYMENT',
    'Initial seeded prepaid wallet balance',
    NOW()
FROM billing_wallets WHERE id = 'ba000000-0000-0000-0000-000000000002'
ON CONFLICT (id) DO NOTHING;

INSERT INTO billing_wallet_ledger (
    id, organization_id, wallet_id, entry_type, amount_minor, balance_after_minor,
    reference_type, description, created_at
)
SELECT
    'bd000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'ba000000-0000-0000-0000-000000000003',
    'TOP_UP',
    100000,
    100000,
    'PAYMENT',
    'Initial seeded prepaid wallet balance',
    NOW()
FROM billing_wallets WHERE id = 'ba000000-0000-0000-0000-000000000003'
ON CONFLICT (id) DO NOTHING;

