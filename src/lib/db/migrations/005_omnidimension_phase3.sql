-- 005_omnidimension_phase3.sql
-- VoiceNuvo Phase 3: OmniDimension Voice Provider Integration & Control Plane Schema

-- 1. Provider Connections (Organization-scoped external voice provider credentials)
CREATE TABLE IF NOT EXISTS provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    display_name VARCHAR(100) NOT NULL DEFAULT 'OmniDimension Voice',
    encrypted_credentials TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    last_verified_at TIMESTAMPTZ,
    last_error_code VARCHAR(100),
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider UNIQUE (organization_id, provider)
);

-- 2. Voice Agents (Control plane metadata mapping to external provider agents)
CREATE TABLE IF NOT EXISTS voice_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_agent_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider_agent UNIQUE (organization_id, provider, provider_agent_id)
);

-- 3. Knowledge Base Files (Control plane metadata mapping to provider files)
CREATE TABLE IF NOT EXISTS knowledge_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_file_id VARCHAR(100) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'READY',
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider_file UNIQUE (organization_id, provider, provider_file_id)
);

-- 4. Phone Numbers (Control plane inventory & agent assignment mapping)
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_phone_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    region VARCHAR(20) NOT NULL DEFAULT 'US',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    assigned_agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider_phone UNIQUE (organization_id, provider, provider_phone_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_provider_connections_org ON provider_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_org ON voice_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_provider_id ON voice_agents(provider, provider_agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_org ON knowledge_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_provider_id ON knowledge_files(provider, provider_file_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org ON phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_agent ON phone_numbers(assigned_agent_id);

-- Row Level Security (RLS)
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_connections_policy ON provider_connections
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY voice_agents_policy ON voice_agents
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY knowledge_files_policy ON knowledge_files
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

CREATE POLICY phone_numbers_policy ON phone_numbers
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );
