-- 007_campaigns_phase5.sql
-- VoiceNuvo Phase 5: Bulk Calling, Campaigns, Contacts, Scheduling & Rotation Schema

-- 1. Insert Campaign Permissions
INSERT INTO permissions (id, key, description) VALUES
  ('a0000000-0000-0000-0000-000000000018', 'CAMPAIGN_VIEW', 'View bulk-call campaigns, progress, and contact-level results'),
  ('a0000000-0000-0000-0000-000000000019', 'CAMPAIGN_CREATE', 'Create new bulk-call campaigns and draft configurations'),
  ('a0000000-0000-0000-0000-000000000020', 'CAMPAIGN_MANAGE', 'Update campaign settings, concurrency, calling window, and rotation pool'),
  ('a0000000-0000-0000-0000-000000000021', 'CAMPAIGN_DISPATCH', 'Start, pause, resume, and cancel bulk-call campaigns'),
  ('a0000000-0000-0000-0000-000000000022', 'CAMPAIGN_RETRY', 'Trigger retries on eligible unanswered or failed campaign contacts'),
  ('a0000000-0000-0000-0000-000000000023', 'CAMPAIGN_EXPORT', 'Export campaign contacts and analytics to CSV')
ON CONFLICT (key) DO NOTHING;

-- Map permissions to roles (safely joins against roles table)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('MAIN_ADMIN', 'ORG_ADMIN')
  AND p.key IN ('CAMPAIGN_VIEW', 'CAMPAIGN_CREATE', 'CAMPAIGN_MANAGE', 'CAMPAIGN_DISPATCH', 'CAMPAIGN_RETRY', 'CAMPAIGN_EXPORT')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'EMPLOYEE'
  AND p.key IN ('CAMPAIGN_VIEW', 'CAMPAIGN_DISPATCH')
ON CONFLICT DO NOTHING;

-- 2. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_campaign_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_id UUID NOT NULL REFERENCES voice_agents(id) ON DELETE RESTRICT,
    provider_agent_id VARCHAR(100) NOT NULL,
    phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
    provider_phone_number_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    concurrency INTEGER NOT NULL DEFAULT 1,
    retry_policy JSONB NOT NULL DEFAULT '{"auto_retry": false, "retry_limit": 1}'::jsonb,
    calling_window JSONB NOT NULL DEFAULT '{"enabled": false}'::jsonb,
    rotation_config JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    completed_contacts INTEGER NOT NULL DEFAULT 0,
    failed_contacts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Campaign Contacts Table
CREATE TABLE IF NOT EXISTS campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    provider_line_id VARCHAR(100),
    phone_number VARCHAR(50) NOT NULL,
    normalized_phone_number VARCHAR(50) NOT NULL,
    custom_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    failure_reason TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    provider_call_id VARCHAR(100),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_campaign_contact_phone UNIQUE (campaign_id, normalized_phone_number)
);

-- 4. Campaign Number Rotation Pool Table
CREATE TABLE IF NOT EXISTS campaign_number_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
    provider_number_id VARCHAR(100) NOT NULL,
    provider_assignment_id VARCHAR(100),
    phone_number VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sequence INTEGER NOT NULL DEFAULT 10,
    health_score NUMERIC(5,2),
    calls_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_campaign_pool_number UNIQUE (campaign_id, phone_number_id)
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_provider_id ON campaigns(provider, provider_campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_agent ON campaigns(agent_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_number ON campaigns(phone_number_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_org ON campaign_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_provider_line ON campaign_contacts(campaign_id, provider_line_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_call_id ON campaign_contacts(call_id);

CREATE INDEX IF NOT EXISTS idx_campaign_number_pool_campaign ON campaign_number_pool(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_number_pool_phone ON campaign_number_pool(phone_number_id);

-- 6. Row Level Security (RLS)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_number_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_policy ON campaigns
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY campaign_contacts_policy ON campaign_contacts
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY campaign_number_pool_policy ON campaign_number_pool
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );
