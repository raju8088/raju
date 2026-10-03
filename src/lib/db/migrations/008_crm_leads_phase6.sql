-- 008_crm_leads_phase6.sql
-- VoiceNuvo Phase 6: CRM, Leads, Contacts, Sources, Meta Lead Ads, Inbound Capture, Correlation & Activity Schema

-- 1. Insert Phase 6 CRM Permissions
INSERT INTO permissions (id, key, description) VALUES
  ('a0000000-0000-0000-0000-000000000024', 'LEAD_VIEW', 'View organization leads, statuses, and CRM activities'),
  ('a0000000-0000-0000-0000-000000000025', 'LEAD_CREATE', 'Create new leads manually or via inbound capture'),
  ('a0000000-0000-0000-0000-000000000026', 'LEAD_MANAGE', 'Update lead status, priority, tags, follow-ups, and notes'),
  ('a0000000-0000-0000-0000-000000000027', 'LEAD_ASSIGN', 'Assign leads to team members or voice agents'),
  ('a0000000-0000-0000-0000-000000000028', 'LEAD_IMPORT', 'Bulk import leads from CSV files'),
  ('a0000000-0000-0000-0000-000000000029', 'LEAD_EXPORT', 'Export leads and contact lists to CSV'),
  ('a0000000-0000-0000-0000-000000000030', 'LEAD_DELETE', 'Archive or delete leads'),
  ('a0000000-0000-0000-0000-000000000031', 'CONTACT_VIEW', 'View contact records and customer identities'),
  ('a0000000-0000-0000-0000-000000000032', 'CONTACT_MANAGE', 'Create and update customer contact details'),
  ('a0000000-0000-0000-0000-000000000033', 'INTEGRATION_MANAGE', 'Configure external integrations such as Meta Lead Ads')
ON CONFLICT (key) DO NOTHING;

-- Map permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('MAIN_ADMIN', 'ORG_ADMIN')
  AND p.key IN (
    'LEAD_VIEW', 'LEAD_CREATE', 'LEAD_MANAGE', 'LEAD_ASSIGN',
    'LEAD_IMPORT', 'LEAD_EXPORT', 'LEAD_DELETE', 'CONTACT_VIEW',
    'CONTACT_MANAGE', 'INTEGRATION_MANAGE'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'EMPLOYEE'
  AND p.key IN ('LEAD_VIEW', 'LEAD_CREATE', 'LEAD_MANAGE', 'CONTACT_VIEW')
ON CONFLICT DO NOTHING;

-- 2. Contacts Table (Normalized customer identity)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    normalized_phone VARCHAR(50),
    email VARCHAR(255),
    company VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    timezone VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_contacted_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ
);

-- 3. Lead Sources Table
CREATE TABLE IF NOT EXISTS lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    platform VARCHAR(50),
    external_source_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Leads Table (Sales/Opportunity record tied to Contact)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    title VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    stage VARCHAR(50) NOT NULL DEFAULT 'NEW',
    source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
    source_type VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    source_name VARCHAR(255),
    external_id VARCHAR(255),
    external_platform VARCHAR(50),
    external_form_id VARCHAR(255),
    external_ad_id VARCHAR(255),
    external_campaign_id VARCHAR(255),
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    score INTEGER NOT NULL DEFAULT 0,
    qualification_status VARCHAR(50) NOT NULL DEFAULT 'UNQUALIFIED',
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_term VARCHAR(100),
    utm_content VARCHAR(100),
    raw_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    next_follow_up_at TIMESTAMPTZ,
    follow_up_status VARCHAR(50) NOT NULL DEFAULT 'NONE',
    first_contacted_at TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Lead Activities Table (Chronological CRM timeline)
CREATE TABLE IF NOT EXISTS lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reference_id VARCHAR(255),
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Lead Notes Table
CREATE TABLE IF NOT EXISTS lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Lead Assignments Table (Audit of ownership changes)
CREATE TABLE IF NOT EXISTS lead_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    previous_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    new_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    previous_agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    new_agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Lead Field Definitions Table
CREATE TABLE IF NOT EXISTS lead_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_lead_field_key UNIQUE (organization_id, key)
);

-- 9. External Lead Events Table (Idempotency and deduplication)
CREATE TABLE IF NOT EXISTS external_lead_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    external_lead_id VARCHAR(255),
    event_hash VARCHAR(255),
    processing_status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    error_message_safe TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT unique_external_lead_event UNIQUE (organization_id, provider, provider_event_id)
);

-- 10. Meta Integrations Table (Provider connection for Meta Lead Ads)
CREATE TABLE IF NOT EXISTS meta_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL DEFAULT 'META',
    page_id VARCHAR(100),
    page_name VARCHAR(255),
    business_id VARCHAR(100),
    ad_account_id VARCHAR(100),
    encrypted_access_token TEXT NOT NULL,
    token_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhook_verify_token VARCHAR(255),
    app_secret_proof_enabled BOOLEAN NOT NULL DEFAULT true,
    connection_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    auto_call_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_call_agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    auto_call_phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Correlation Foreign Keys & Columns on Calls and Campaign Contacts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'lead_id'
    ) THEN
        ALTER TABLE calls ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'campaign_contacts' AND column_name = 'lead_id'
    ) THEN
        ALTER TABLE campaign_contacts ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 12. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts(organization_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity ON contacts(organization_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_sources_org ON lead_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_type ON lead_sources(organization_id, type);

CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent ON leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(organization_id, external_platform, external_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(organization_id, next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_lead_activities_org ON lead_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_notes_org ON lead_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_org ON lead_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead ON lead_assignments(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_lead_events_org ON external_lead_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_external_lead_events_lookup ON external_lead_events(organization_id, provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_meta_integrations_org ON meta_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_meta_integrations_page ON meta_integrations(organization_id, page_id);

CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_lead_id ON campaign_contacts(lead_id);

-- 13. Row Level Security (RLS)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_policy ON contacts FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY lead_sources_policy ON lead_sources FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY leads_policy ON leads FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY lead_activities_policy ON lead_activities FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY lead_notes_policy ON lead_notes FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY lead_assignments_policy ON lead_assignments FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY lead_field_definitions_policy ON lead_field_definitions FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY external_lead_events_policy ON external_lead_events FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY meta_integrations_policy ON meta_integrations FOR ALL
  USING (is_main_admin() OR organization_id IN (SELECT get_my_org_ids()));
