-- 006_calling_phase4.sql
-- VoiceNuvo Phase 4: Calling Engine, Call Logs, Webhooks, Recordings & Transcripts

-- 1. Calls Table (Control plane call index and operational telemetry)
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'OMNIDIMENSION',
    provider_call_id VARCHAR(100),
    provider_request_id VARCHAR(100),
    agent_id UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
    provider_agent_id VARCHAR(100) NOT NULL,
    phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
    provider_phone_number_id VARCHAR(100),
    direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
    destination_number VARCHAR(50) NOT NULL,
    source_number VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    duration_source VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
    recording_url TEXT,
    recording_available BOOLEAN NOT NULL DEFAULT false,
    summary TEXT,
    sentiment VARCHAR(50),
    sentiment_details TEXT,
    extracted_variables JSONB DEFAULT '{}'::jsonb,
    transcript TEXT,
    call_context JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255),
    last_provider_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_calls_org ON calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_provider_call_id ON calls(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_provider_request_id ON calls(provider_request_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_calls_destination ON calls(destination_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_idempotency ON calls(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Row Level Security (RLS)
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY calls_policy ON calls
    FOR ALL
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );
