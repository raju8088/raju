# VoiceNuvo — Phase 4 Implementation Report
## Calling Engine, Call Dispatch, Call Logs, Webhooks, Recordings & Transcripts

**Date:** October 2, 2026  
**Architect & Full-Stack Implementation Engineer:** Google DeepMind / Antigravity Pair  
**Phase Status:** **PASS (Production Ready & Verified)**  

---

### 1. Scope

Phase 4 delivers the core **Calling Engine** for VoiceNuvo, enabling multi-tenant organizations to dispatch outbound voice calls through OmniDimension, track call lifecycle states, receive real-time webhook deliveries, view comprehensive call histories, inspect AI summaries and sentiment analysis, read sanitized turn-by-turn dialogue transcripts, and listen to recordings.

#### Strict Non-Goals (Preserved for Future Phases)
- **Phase 5**: No bulk calling campaigns, campaign scheduling, retry engines, or rotating caller pools.
- **Phase 6**: No CRM, leads, contacts, or Meta Ads integration.
- **Phase 7**: No billing, Razorpay, subscriptions, wallets, credits, invoices, or GST logic.
- **No Side Effects in Automated Tests**: Real outbound phone calls are strictly prohibited during normal automated testing; live call dispatch is opt-in only.

---

### 2. Architecture Changes

The architecture strictly maintains the multi-tier abstraction pattern established in Phases 1–3:

```
[ Next.js 16 Client UI (App Router) ]
                │
                ▼ (No provider secrets or API keys)
[ VoiceNuvo REST Control Plane API ]
  ├── /api/calls
  ├── /api/calls/[id]
  ├── /api/calls/dispatch
  └── /api/webhooks/omnidimension/call
                │
                ▼ (Tenant Isolation + RBAC + Rate Limiting)
[ Application Service Layer: CallService ]
  ├── Organization ownership validation
  ├── E.164 phone number normalization & validation
  ├── Dispatch idempotency cache & DB locking
  └── Audit log telemetry (CALL_DISPATCH_REQUESTED, etc.)
                │
                ▼ (Agile Provider Abstraction)
[ VoiceProvider Interface ]
  ├── dispatchCall(...)
  ├── listCallLogs(...)
  └── getCallLog(...)
        ├── MockVoiceProvider (Default automated test runner)
        └── OmniDimensionProvider (Official @omnidim-ai/sdk server adapter)
```

1. **Client Isolation**: The browser client never receives provider API keys or direct access to OmniDimension endpoints.
2. **Provider Agnosticism**: Application services interact only with the `VoiceProvider` interface; OmniDimension SDK types are cleanly isolated within `src/lib/providers/voice/omnidimension/`.
3. **Dual Driver Support**: Full operational support for both persistent PostgreSQL (`pg.Pool`) and disk-persisted `PGlite` with Row-Level Security.

---

### 3. Database Changes

#### Migration Script: `src/lib/db/migrations/006_calling_phase4.sql`
Creates the `calls` table with indices and Row-Level Security policies:

```sql
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
```

---

### 4. Provider Changes

1. **Extended `VoiceProvider` Interface (`src/lib/providers/voice/provider-types.ts`)**:
   - `dispatchCall(input: DispatchCallInput): Promise<DispatchCallResult>`
   - `listCallLogs(query?: ListCallLogsQuery): Promise<{ logs: ProviderCallLog[]; total: number }>`
   - `getCallLog(providerCallId: string): Promise<ProviderCallLog>`

2. **Official OmniDimension SDK Integration (`src/lib/providers/voice/omnidimension/omnidimension.provider.ts`)**:
   - Integrates `client.calls.dispatch({ agent_id, to_number, from_number_id, call_context, metadata })`.
   - Integrates `client.calls.listLogs({ pageno, pagesize, agentid, call_status })`.
   - Integrates `client.calls.get(providerCallId)`.
   - Handles network and provider error normalization via `mapOmniDimensionError`.

3. **Status & Duration Normalization (`src/lib/providers/voice/call-normalizer.ts`)**:
   - Maps provider statuses into stable internal statuses: `QUEUED`, `RINGING`, `IN_PROGRESS`, `COMPLETED`, `BUSY`, `NO_ANSWER`, `FAILED`, `CANCELED`, and `PROVIDER_REPORTED`.
   - Implements `canTransitionCallStatus` to protect terminal states (`COMPLETED`, `BUSY`, `FAILED`) against downgrades from delayed or out-of-order webhook deliveries.
   - Calculates integer duration seconds with authoritative source attribution: `PROVIDER_REPORTED`, `SERVER_CALCULATED`, or `UNKNOWN`.

4. **Mock Voice Provider (`src/lib/providers/voice/mock.provider.ts`)**:
   - In-memory mock call registry with predictable IDs, seeded status transitions, transcript fixtures, sentiment analysis fixtures, and recording URLs.

---

### 5. API Routes

| Endpoint | Method | Permission | Description |
|---|---|---|---|
| `/api/calls` | `GET` | `CALL_VIEW` | Lists tenant call history with pagination, agent filter, status filter, direction filter, and search. |
| `/api/calls/dispatch` | `POST` | `CALL_DISPATCH` | Validates ownership, checks idempotency, applies rate limits, and dispatches an outbound call. |
| `/api/calls/[id]` | `GET` | `CALL_VIEW` | Retrieves call details. Supports `?refresh=true` for on-demand live provider synchronization. |
| `/api/webhooks/omnidimension/call` | `POST` | Public (Verified) | Ingests post-call webhook payloads, validates secret/signature, correlates call, and updates records idempotently. |

---

### 6. Webhook Design

1. **Correlation Strategy**:
   - Primary: Correlation via `metadata.voicenuvo_call_id` injected during outbound dispatch.
   - Fallback 1: Correlation via `provider_call_id` (`call_id` / `id`).
   - Fallback 2: Correlation via `provider_request_id` (`requestId` / `call_request_id`).
2. **Idempotency & Replay Protection**:
   - Repeated delivery of identical webhook events produces zero duplicates and leaves existing call states intact.
   - Stale non-terminal events (e.g., `in-progress` arriving after `completed`) are safely ignored; terminal duration is never downgraded.
3. **Payload Sanitization**:
   - Extracts structured summaries, sentiment scores, and extracted variables into `JSONB`.
   - Stores normalized turn-by-turn conversation text without raw HTML execution.

---

### 7. UI Changes

1. **Dashboard Navigation (`src/components/layout/dashboard-sidebar.tsx`)**:
   - Added **Calls & Logs** navigation item with `PhoneCall` icon.
2. **Call History Page (`src/app/dashboard/calls/page.tsx`)**:
   - Responsive telemetry table with status badges (`Completed`, `In Progress`, `Ringing`, `Failed`, etc.).
   - Direction indicators (Inbound vs Outbound).
   - Audio recording and transcript availability indicators.
   - Search by destination number and filtering by Status, Direction, and Agent.
   - Pagination controls.
3. **Call Detail Page (`src/app/dashboard/calls/[id]/page.tsx`)**:
   - **Header**: Call direction, destination, status badge, date/time, copyable Call ID, and live Sync Provider button.
   - **KPI Grid**: Participants card, Agent card, Duration with source attribution, and Provider tracking metadata.
   - **Recording Section**: HTML5 audio player if recording URL is present; "Recording unavailable" fallback notice if absent.
   - **AI Analysis**: Synthesized Call Summary, Sentiment badge, Extracted Variables key-value table.
   - **Conversation Transcript**: Turn-by-turn dialogue viewer with role-based speech bubbles (Agent vs Customer), sanitized rendering, and copy button.
4. **Dispatch Modal (`src/components/calls/dispatch-modal.tsx`)**:
   - Agent selection dropdown and optional Caller ID phone number selector.
   - Destination number input with E.164 validation.
   - Key/value builder for Dynamic Call Context.
   - Key/value builder for Correlation Metadata tags.
   - Confirmation step with double-submit prevention.

---

### 8. RBAC Changes

Added 3 granular permissions to `src/types/index.ts` and `src/lib/permissions/permissions.ts`:
- `CALL_VIEW`: View call logs, transcripts, summaries, and recordings.
- `CALL_DISPATCH`: Dispatch outbound calls through voice agents.
- `CALL_MANAGE`: Manage call settings, force status sync, and configure webhooks.

#### Role Matrix
- **`MAIN_ADMIN`**: Full platform-wide access (`CALL_VIEW`, `CALL_DISPATCH`, `CALL_MANAGE`).
- **`ORG_ADMIN`**: Full organization access (`CALL_VIEW`, `CALL_DISPATCH`, `CALL_MANAGE`).
- **`EMPLOYEE`**: Operational access (`CALL_VIEW`, `CALL_DISPATCH`); denied `CALL_MANAGE`.
- **Unprivileged Users**: Rejected with `403 Forbidden` (`AuthorizationError`).

---

### 9. Security Controls

1. **Tenant Isolation**:
   - All queries, dispatches, and log retrievals strictly resolve `organization_id` server-side from session context.
   - Cross-tenant attempts (Tenant B attempting to view, refresh, or dispatch using Tenant A agents/numbers) are blocked with `403`/`404`.
2. **Credential Sanitization**:
   - Zero client-side API key exposure.
   - Audit log entries redact all auth headers, bearer tokens, and API keys.
   - Webhook responses return sanitized JSON without credentials.
3. **Rate Limiting**:
   - Outbound call dispatch enforces sliding-window atomic rate limiting (`30 requests / 60s` per organization).
4. **Input Validation**:
   - E.164 phone regex enforcement: `^\+[1-9]\d{6,14}$`.
   - Bounded JSON object sizes for dynamic context and metadata.

---

### 10. Idempotency Design

- Outbound dispatches accept an optional `idempotencyKey` (or auto-generate one per dispatch session).
- Unique partial database index: `CREATE UNIQUE INDEX idx_calls_idempotency ON calls(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- If a client resubmits a dispatch with the same idempotency key:
  1. The service looks up the existing record in the database.
  2. The original call record is returned immediately.
  3. No secondary request is sent to OmniDimension, preventing duplicate carrier charges.

---

### 11. Test Results

Automated test suite executed via Vitest across 17 test files:

```text
 ✓ tests/audit-ratelimit.test.ts (2 tests)
 ✓ tests/auth.test.ts (7 tests)
 ✓ tests/authorization.test.ts (7 tests)
 ✓ tests/database-rls.test.ts (9 tests)
 ✓ tests/driver-health.test.ts (3 tests)
 ✓ tests/organizations.test.ts (11 tests)
 ✓ tests/persistence.test.ts (4 tests)
 ✓ tests/phase3-omnidimension.test.ts (21 tests)
 ✓ tests/phase4-calling.test.ts (20 tests)
 ✓ tests/remote-postgres.test.ts (4 tests)
 ✓ tests/seed-safety.test.ts (5 tests)
 ✓ tests/startup-config.test.ts (9 tests)
 ✓ tests/tenant-isolation.test.ts (5 tests)
 ✓ tests/transactions.test.ts (4 tests)
 ✓ tests/validation.test.ts (7 tests)

Test Files:  17 passed (17)
Tests:       114 passed | 19 skipped (133 total)
Duration:    16.13s
```

All 20 tests in `tests/phase4-calling.test.ts` passed:
- E.164 phone validation (accepts valid, rejects invalid formats)
- Dynamic call context & metadata size limits
- Status normalization and terminal downgrade protection
- Duration normalization (provider reported, server calculated, unknown fallback)
- Outbound dispatch and audit log verification
- Cross-tenant agent and phone number rejection
- Dispatch idempotency replay
- Webhook correlation and telemetry persistence
- Duplicate/stale webhook protection
- Multi-tenant isolation
- RBAC authorization checks
- Secret leak scans

---

### 12. Build Results

- **TypeScript (`npx tsc --noEmit`)**: Clean (Code 0, zero errors).
- **ESLint (`npm run lint`)**: Clean (Code 0, zero warnings, zero errors).
- **Production Build (`npm run build`)**: Next.js 16.3.8 Turbopack build succeeded with 39 static & dynamic routes compiled and optimized.

---

### 13. Live Verification Results

Executed against the live OmniDimension platform using `OMNIDIM_API_KEY`:

```text
 RUN  v5.0.3 tests/live-phase4-calling.test.ts

 ✓ Safety Protocol & Key Availability (Section 9, 35)
   ✓ detects OMNIDIM_API_KEY safely without logging secrets
   ✓ enforces safety guard: real outbound calling is DISABLED by default in automated tests
 ✓ Read-Only Live OmniDimension Telemetry & Logs
   ✓ queries historical call logs through live OmniDimension SDK without placing calls (1517ms)
   ✓ retrieves and normalizes live call detail if a call record exists on OmniDimension (1064ms)
   ✓ rejects dispatch with invalid agent ID gracefully without leaking SDK traces (402ms)
   ✓ safely normalizes provider errors when querying non-existent call ID (VoiceProviderError)
 ↓ Opt-In Live Outbound Call Execution
   ↓ executes a live outbound call (safely skipped: requires explicit RUN_LIVE_CALL_TEST=true and TEST_CALL_NUMBER)

Test Files: 1 passed (1)
Tests:      6 passed | 1 skipped (7 total)
Duration:   3.80s
```

---

### 14. Known Limitations

1. **Carrier Latency on Dispatch**: OmniDimension outbound dispatches are asynchronous. The dispatch API confirms that the provider accepted the call request (`QUEUED`/`status: dispatched`); actual call outcomes (`COMPLETED`, `BUSY`, `NO_ANSWER`) are updated asynchronously via post-call webhooks or manual provider sync.
2. **Audio File Storage**: Audio recordings are streamed via sanitized provider URLs; permanent VoiceNuvo S3/cloud storage archiving is deferred to future enterprise storage phases.

---

### 15. Exact Next Phase Recommendation

Proceed to **Phase 5: Bulk Calling Campaigns & Contact Management Foundation**:
1. Implement contact list upload and CSV parsing with E.164 sanitization.
2. Build campaign orchestration engine to sequence outbound calls through the Phase 4 calling engine.
3. Implement pacing controls and concurrency limits to respect provider rate limits.
4. Introduce campaign-level analytics aggregated from normalized call logs.
