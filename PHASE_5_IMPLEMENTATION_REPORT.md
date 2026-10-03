# VoiceNuvo — Phase 5 Implementation Report
## Bulk Calling, Campaigns, Contacts, Scheduling, Retry, Concurrency, Number Rotation & Campaign Analytics

**Document Version:** 1.0.0  
**Phase:** 5 (Bulk Calling & Campaign Engine)  
**Date:** October 3, 2026  
**Architect:** Senior Full-Stack Architect & Implementation Engineer  

---

## 1. Scope

Phase 5 delivers the multi-tenant Bulk Calling and Campaign Engine for VoiceNuvo, built on top of the Phase 4 calling engine and provider abstraction. It establishes VoiceNuvo as the enterprise SaaS control plane while leveraging OmniDimension as the bulk execution engine.

### Strict Boundaries Maintained:
- **Phase 4 Preserved:** Reused the Phase 4 dispatch engine, call log models, webhook infrastructure, audio transcripts, and recording architecture.
- **No Direct Provider Access in Client:** OmniDimension SDK calls are executed strictly server-side through `VoiceProvider -> OmniDimensionProvider -> @omnidim-ai/sdk`. No provider API keys or tokens are ever exposed to the browser.
- **CRM Separation:** Contact line items are strictly campaign-scoped (`campaign_contacts`). No CRM tables, leads pipeline, or contact scoring were created (reserved for Phase 6).
- **Billing Foundation Prepared:** Schema and data models retain call durations, outcomes, provider call IDs, timestamps, and retry counts for Phase 7 Razorpay/wallet integration without executing credit deductions in Phase 5.
- **Real-World Dialing Safety:** Automated test suites strictly forbid dialing real phone numbers or launching live bulk campaigns without explicit environment opt-in (`RUN_LIVE_CAMPAIGN_TEST=true`).

---

## 2. Architecture

```
VoiceNuvo UI (Next.js 16 App Router)
   │
   ├─ /dashboard/campaigns (List, Metrics & Filters)
   ├─ /dashboard/campaigns/new (7-Step Creation Wizard)
   └─ /dashboard/campaigns/[id] (Detail, Telemetry, Controls & Contacts)
       │
       ▼ (Fetch API / JSON)
VoiceNuvo API Layer (/api/campaigns/*)
   │
   ├─ Session Authentication & RBAC Permission Guards
   ├─ Tenant Isolation Verification (Organization Context)
   ├─ Zod Schema Request Validation & Row-Level CSV Validation
   │
   ▼
CampaignService (src/services/campaign.service.ts)
   │
   ├─ Agent & Caller Phone Organization Ownership Verification
   ├─ Contact Ingestion & Sequential Chunking (1,000 items / batch)
   ├─ Campaign State Machine & Idempotency Controls
   ├─ Cursor-Paginated Result Reconciliation
   ├─ Audit Logging (src/lib/db/repositories/audit.repository.ts)
   │
   ▼
Repositories (PostgreSQL / Supabase / PGlite with RLS)
   ├─ CampaignRepository (campaigns)
   ├─ CampaignContactRepository (campaign_contacts)
   └─ CampaignNumberPoolRepository (campaign_number_pool)
   │
   ▼
VoiceProvider Abstraction (src/lib/providers/voice/provider-types.ts)
   │
   ├─ MockVoiceProvider (In-memory simulation with realistic line metrics)
   └─ OmniDimensionProvider (Official @omnidim-ai/sdk Bulk Call client)
```

---

## 3. Database Changes

Migration file: `src/lib/db/migrations/007_campaigns_phase5.sql`

### 3.1 Tables Created

1. **`campaigns`**:
   - `id` (UUID PK, gen_random_uuid())
   - `organization_id` (UUID FK -> organizations(id) ON DELETE CASCADE)
   - `provider` (TEXT NOT NULL DEFAULT 'OMNIDIMENSION')
   - `provider_campaign_id` (TEXT NULL)
   - `name` (TEXT NOT NULL)
   - `description` (TEXT NULL)
   - `agent_id` (UUID NOT NULL FK -> voice_agents(id))
   - `provider_agent_id` (TEXT NULL)
   - `phone_number_id` (UUID NOT NULL FK -> phone_numbers(id))
   - `provider_phone_number_id` (TEXT NULL)
   - `status` (TEXT NOT NULL DEFAULT 'DRAFT')
   - `timezone` (TEXT NOT NULL DEFAULT 'Asia/Kolkata')
   - `concurrency` (INTEGER NOT NULL DEFAULT 1)
   - `retry_policy` (JSONB NOT NULL DEFAULT '{"auto_retry": true, "max_retries": 2, "failure_reasons": ["no-answer", "busy", "failed"]}')
   - `calling_window` (JSONB NOT NULL DEFAULT '{"enabled": false, "start_time": 9, "stop_time": 18, "timezone": "Asia/Kolkata"}')
   - `rotation_strategy` (TEXT NOT NULL DEFAULT 'none')
   - `total_contacts` (INTEGER NOT NULL DEFAULT 0)
   - `completed_contacts` (INTEGER NOT NULL DEFAULT 0)
   - `failed_contacts` (INTEGER NOT NULL DEFAULT 0)
   - `connected_contacts` (INTEGER NOT NULL DEFAULT 0)
   - `created_by` (UUID NOT NULL FK -> users(id))
   - `started_at`, `paused_at`, `completed_at`, `created_at`, `updated_at` (TIMESTAMPTZ)
   - **Indexes:** `idx_campaigns_org`, `idx_campaigns_status`, `idx_campaigns_agent`, `idx_campaigns_phone`, `idx_campaigns_provider_id`, `idx_campaigns_created_at`.
   - **Unique Constraint:** `(organization_id, provider_campaign_id)` WHERE `provider_campaign_id IS NOT NULL`.

2. **`campaign_contacts`**:
   - `id` (UUID PK, gen_random_uuid())
   - `organization_id` (UUID FK -> organizations(id) ON DELETE CASCADE)
   - `campaign_id` (UUID FK -> campaigns(id) ON DELETE CASCADE)
   - `provider_line_id` (TEXT NULL)
   - `phone_number` (TEXT NOT NULL)
   - `normalized_phone_number` (TEXT NOT NULL)
   - `custom_variables` (JSONB NOT NULL DEFAULT '{}')
   - `metadata` (JSONB NOT NULL DEFAULT '{}')
   - `status` (TEXT NOT NULL DEFAULT 'PENDING')
   - `failure_reason` (TEXT NULL)
   - `attempt_count` (INTEGER NOT NULL DEFAULT 0)
   - `last_attempt_at`, `completed_at` (TIMESTAMPTZ NULL)
   - `duration_seconds` (INTEGER NOT NULL DEFAULT 0)
   - `provider_call_id` (TEXT NULL)
   - `created_at`, `updated_at` (TIMESTAMPTZ)
   - **Indexes:** `idx_campaign_contacts_org`, `idx_campaign_contacts_campaign`, `idx_campaign_contacts_status`, `idx_campaign_contacts_phone`, `idx_campaign_contacts_provider_line`, `idx_campaign_contacts_provider_call`.
   - **Unique Constraint:** `(campaign_id, normalized_phone_number)` to prevent duplicate entries within the same campaign.

3. **`campaign_number_pool`**:
   - `id` (UUID PK, gen_random_uuid())
   - `organization_id` (UUID FK -> organizations(id) ON DELETE CASCADE)
   - `campaign_id` (UUID FK -> campaigns(id) ON DELETE CASCADE)
   - `phone_number_id` (UUID FK -> phone_numbers(id) ON DELETE CASCADE)
   - `provider_assignment_id` (TEXT NULL)
   - `is_active` (BOOLEAN NOT NULL DEFAULT true)
   - `sequence_order` (INTEGER NOT NULL DEFAULT 0)
   - `calls_count` (INTEGER NOT NULL DEFAULT 0)
   - `health_score` (NUMERIC(5,2) NULL)
   - `created_at` (TIMESTAMPTZ)
   - **Indexes:** `idx_campaign_pool_org`, `idx_campaign_pool_campaign`, `idx_campaign_pool_phone`.
   - **Unique Constraint:** `(campaign_id, phone_number_id)`.

### 3.2 Multi-Tenant RLS Policies
All three tables have PostgreSQL Row Level Security (RLS) enabled:
- Policies enforce `is_main_admin() OR organization_id IN (SELECT get_my_org_ids())` for SELECT, INSERT, UPDATE, and DELETE operations.
- Seed data insertion is conditioned on `roles CROSS JOIN permissions` to guarantee clean execution whether `SEED_DEMO_DATA=true` or `SEED_DEMO_DATA=false`.

---

## 4. Campaign Lifecycle State Machine

Normalized VoiceNuvo Campaign Statuses:
- `DRAFT`: Initial creation state. Contacts can be imported, settings configured, and caller number pool modified. No calls are dispatched.
- `QUEUED`: Submitted to provider engine and waiting for calling window or engine queue slot.
- `IN_PROGRESS`: Actively placing calls according to concurrency limit and daily calling window.
- `PAUSED`: Temporarily stopped by user. Outgoing dispatches halted. Can be resumed.
- `COMPLETED`: All contacts processed (either successfully answered or max retries exhausted).
- `CANCELED`: Safely stopped by user or system. No further calls will be initiated.
- `FAILED`: Fatal provider or campaign initialization failure.

State Transitions:
- `DRAFT -> IN_PROGRESS` (via `/start` endpoint after contact and provider validation)
- `IN_PROGRESS -> PAUSED` (via `/pause` endpoint)
- `PAUSED -> IN_PROGRESS` (via `/resume` endpoint)
- `(DRAFT | IN_PROGRESS | PAUSED) -> CANCELED` (via `/cancel` endpoint)
- `IN_PROGRESS -> COMPLETED` (via result reconciliation when pending count reaches 0)

Backward status mutations from stale provider polling responses are explicitly rejected.

---

## 5. Contact Import & Validation

1. **Manual Entry & CSV Parsing:**
   - Server-side CSV parser (`parseAndValidateCsv` in `src/lib/validation/campaign.schema.ts`).
   - Validates CSV headers, row counts, and column mappings.
   - Enforces max file size (10MB) and maximum rows (10,000 per import batch).
2. **Row-Level Validation:**
   - Normalizes international phone numbers via `normalizePhoneNumber()` using E.164 conventions.
   - Reports exact row-level rejection reasons (e.g. `Invalid international phone number`, `Missing phone number`).
   - Returns `{ accepted: [...], rejected: [{ row, phone_number, reason }] }` so zero contacts are silently lost.
3. **Sequential Chunking (1,000 contacts / batch):**
   - Ingests contacts into database chunk by chunk.
   - If a provider campaign ID exists, syncs contacts with OmniDimension in batches of up to 1,000 per request, avoiding payload overflow and API rate limit spikes.
4. **Custom Variables & Metadata:**
   - `custom_variables` (e.g. `first_name`, `property_type`, `budget`) are passed to the voice agent as per-contact prompt variables.
   - `metadata` (e.g. `external_id`, `source`) is preserved strictly for internal correlation and not injected into agent conversation prompts.

---

## 6. Provider Operations & Capability Model

The `VoiceProvider` interface exposes:
```ts
interface ProviderCapabilities {
  bulkCampaigns: boolean;
  campaignPauseResume: boolean;
  campaignConcurrency: boolean;
  campaignRetry: boolean;
  campaignCallingWindows: boolean;
  campaignNumberRotation: boolean;
  campaignResults: boolean;
  campaignLiveStatus: boolean;
}
```

### OmniDimension SDK Mapping:
- `createCampaign`: Maps to `client.bulkCalls.createDraftBulkCall` or `client.bulkCalls.createBulkCall`.
- `startCampaign`: Maps to `client.bulkCalls.startDraftBulkCall(providerCampaignId)`.
- `addCampaignContacts`: Maps to `client.bulkCalls.addContacts(providerCampaignId, { contact_list })` in batches <= 1,000.
- `getCampaign`: Maps to `client.bulkCalls.getBulkCallDetails(providerCampaignId)`.
- `getCampaignLiveStatus`: Maps to `client.bulkCalls.getLiveStatus(providerCampaignId)`.
- `listCampaignLines`: Maps to `client.bulkCalls.getBulkCallResults(providerCampaignId, { cursor, page_size })`.
- `pauseCampaign`: Maps to `client.bulkCalls.pauseBulkCall(providerCampaignId)`.
- `resumeCampaign`: Maps to `client.bulkCalls.resumeBulkCall(providerCampaignId)`.
- `cancelCampaign`: Maps to `client.bulkCalls.cancelBulkCall(providerCampaignId)`.
- `setCampaignConcurrency`: Maps to `client.bulkCalls.changeConcurrency(providerCampaignId, { concurrent_call_limit })`.
- `setCampaignDailyTimeControl`: Maps to `client.bulkCalls.setDailyTimeControl(providerCampaignId, ...)`.
- `retryCampaign`: Maps to `client.bulkCalls.retryBulkCall(providerCampaignId, { retry_filter, max_retry_count })`.
- `listCampaignNumbers`: Maps to `client.bulkCalls.listNumberRotationPool(providerCampaignId)`.
- `addCampaignNumber`: Maps to `client.bulkCalls.addNumberToRotationPool(providerCampaignId, phoneNumberId)`.
- `setCampaignNumberActive`: Maps to `client.bulkCalls.updateNumberRotationPool(providerCampaignId, assignmentId, { is_active })`.

If a provider capability is unsupported, the provider returns a normalized `NOT_SUPPORTED` error and the UI dynamically hides or disables the action.

---

## 7. Number Rotation Pool

- **Architecture:** Number rotation enables campaigns to cycle caller IDs across multiple carrier lines, mitigating spam flags and reputation degradation.
- **Ownership Enforcement:** Every phone number added to a campaign rotation pool is verified against the current organization's inventory in `phone_numbers`.
- **Strategies Supported:**
  - `fixed_count`: Round-robin rotation based on number of calls placed per line.
  - `cpr_threshold`: Health-based rotation based on call pickup rate.
  - `both`: Adaptive hybrid combining call counts and CPR health thresholds.
- **Provider Sync:** Persisted locally in `campaign_number_pool` and synced to OmniDimension rotation pool via `client.bulkCalls.addNumberToRotationPool`.

---

## 8. Retry Engine

- **Filtering Options:** Non-connecting calls can be retried by failure category:
  - `no-answer`: Contact did not answer.
  - `busy`: Contact's line was busy.
  - `failed`: Carrier routing or network drop.
- **Max Retries:** User-configurable retry ceiling (1 to 10 attempts).
- **Idempotency & Non-Duplication:** Retrying updates the existing `campaign_contacts` records, resetting status to `QUEUED` and incrementing `attempt_count`, rather than generating duplicate contact rows.

---

## 9. Daily Calling Window & Scheduling

- **Timezone Enforcement:** Supports standard IANA timezones (e.g. `Asia/Kolkata`, `America/New_York`, `UTC`).
- **Operating Hours:** Configurable start hour (e.g. `9` for 09:00) and stop hour (e.g. `18` for 18:00).
- **Hard Stop / Auto Start:** Synced to provider daily time controls to prevent automated calls outside legal compliance calling windows.

---

## 10. Dynamic Concurrency

- **Live Tuning:** Concurrency (simultaneous active call lines) can be adjusted while the campaign is in `IN_PROGRESS` state.
- **Validation:** Bounded between 1 and 100 lines (or organization subscription limit).
- **Confirmation:** Local database state is only updated after provider confirmation.

---

## 11. Webhooks & Call Result Reconciliation

- **Reconciliation Engine:** `syncResults(campaignId, orgId)` polls `listCampaignLines` from the provider using opaque cursor pagination (`cursor: string | undefined`).
- **Correlation Hierarchy:**
  1. Matches by `provider_line_id`
  2. Falls back to `normalized_phone_number`
- **Metric Aggregates:** Recomputes `total_contacts`, `completed_contacts`, `failed_contacts`, and `connected_contacts` on each reconciliation cycle.

---

## 12. RBAC Permissions

Added to `src/types/index.ts` and `src/lib/permissions/permissions.ts`:
- `CAMPAIGN_VIEW`: Read-only access to campaign listings, details, analytics, and contact results.
- `CAMPAIGN_CREATE`: Ability to create campaigns and import contacts.
- `CAMPAIGN_MANAGE`: Ability to update campaign configuration, concurrency, calling windows, and rotation pool.
- `CAMPAIGN_DISPATCH`: Ability to start, pause, resume, and cancel campaigns.
- `CAMPAIGN_RETRY`: Ability to trigger bulk retry operations on failed contacts.
- `CAMPAIGN_EXPORT`: Ability to stream and download contact results as CSV.

All API routes enforce these permissions server-side using `requirePermission(ctx, PERMISSION_KEY)`.

---

## 13. Security & Multi-Tenancy

- **Strict Tenant Isolation:** Every campaign query and mutation scopes strictly by `organization_id`.
- **Cross-Tenant Prevention:** Campaigns verify that the requested agent (`agent_id`) and caller phone (`phone_number_id`) belong to the requesting organization.
- **Secret Protection:** Provider connection tokens and API keys are stored in encrypted `provider_connections` and never logged or serialized to API responses.
- **Audit Logging:** Every campaign mutation logs an immutable audit event (`CAMPAIGN_CREATED`, `CAMPAIGN_STARTED`, `CAMPAIGN_PAUSED`, `CAMPAIGN_RESUMED`, `CAMPAIGN_CANCELED`, `CAMPAIGN_CONCURRENCY_CHANGED`, `CAMPAIGN_CALLING_WINDOW_CHANGED`, `CAMPAIGN_RETRY_REQUESTED`, `CAMPAIGN_CONTACTS_IMPORTED`, `CAMPAIGN_NUMBER_ADDED`).

---

## 14. UI Implementation

1. **Campaign Dashboard (`/dashboard/campaigns`):**
   - KPI aggregate cards: Total Campaigns, Active Running, Completed, Total Contacts.
   - Filter bar: Status select, full-text search, live manual refresh.
   - Campaigns table: Status badge with animated pulse, agent name, source caller ID, contact count, completion rate, created/started timestamps, and quick action buttons.
2. **7-Step Campaign Wizard (`/dashboard/campaigns/new`):**
   - Step 1: Details (Name, Description)
   - Step 2: Agent Selection (with language, voice, and model badges)
   - Step 3: Caller Number & Rotation Pool (Toggle rotation, select pool numbers, configure strategy)
   - Step 4: Contacts Ingestion (Drag-and-drop CSV upload, manual paste, live row-level validation feedback)
   - Step 5: Variable Mapping (Interactive preview of custom variable keys)
   - Step 6: Calling Controls (Concurrency, Daily Calling Window, Timezone, Auto-Retry)
   - Step 7: Comprehensive Review & Draft Creation
3. **Campaign Detail Page (`/dashboard/campaigns/[id]`):**
   - Header with status badge, back navigation, and contextual action buttons (Start, Pause, Resume, Cancel, Retry, Concurrency, Calling Window).
   - High-impact confirmation modal before starting real-world outbound dialing.
   - Overview metrics & visual progress bar.
   - Live Telemetry panel showing provider live status (calls in progress, queued, completed).
   - Tabbed workspace: Contacts Table, Number Rotation Pool, Performance Analytics.
   - Contacts table with pagination, phone number search, status filter, and CSV Export.

---

## 15. Verification & Test Results

### 15.1 Vitest Automated Test Suite
- **Phase 5 Dedicated Suite (`tests/phase5-campaigns.test.ts`):** **27 passed**
  - Unit contact normalization and validation (E.164 formats, empty/malformed numbers, oversized variables).
  - Server-side CSV parsing with row-level error reporting.
  - Complete campaign lifecycle state transitions (Draft -> Start -> Pause -> Resume -> Concurrency -> Calling Window -> Number Pool -> Contacts Import -> Retry -> Cancel).
  - Provider result reconciliation with duration and call ID correlation.
  - Tenant isolation enforcement (preventing cross-organization agent and phone usage).
  - RBAC permission guards (MAIN_ADMIN, ORG_ADMIN, EMPLOYEE permission gates).
- **Phase 5 Live Verification Suite (`tests/live-phase5-campaigns.test.ts`):** **4 passed**
  - Provider capabilities detection.
  - Live connection verification probe against OmniDimension.
  - Safe read-only campaign listing probe.
  - Mutation test safely skipped when `RUN_LIVE_CAMPAIGN_TEST` is unset.
- **Repository-Wide Vitest Suite:** **19 test files passed (100%), 162 tests passed, 2 skipped, 0 failed.**

### 15.2 Code Quality & Static Analysis
- **TypeScript:** `npx tsc --noEmit` passed with 0 errors.
- **ESLint:** `npm run lint` passed with 0 errors, 0 warnings.
- **Production Build:** `npm run build` compiled 42 routes successfully without errors.

---

## 16. Component Status Classification

| Component | Status | Verification Level | Notes |
|:---|:---:|:---:|:---|
| Campaign Engine (CRUD, State Machine) | PASS | MOCK VERIFIED | Full lifecycle tested |
| Contact Import (CSV, Manual, Chunking) | PASS | MOCK VERIFIED | Row-level validation verified |
| Provider Integration (OmniDimension) | PASS | LIVE READ VERIFIED | Capabilities & connection probe verified |
| Retry Engine (Filtering, Max Retries) | PASS | MOCK VERIFIED | Tested with failure reasons |
| Concurrency Control (Live Tuning) | PASS | MOCK VERIFIED | Validated between 1-100 lines |
| Daily Calling Window & Timezones | PASS | MOCK VERIFIED | Timezone & window validated |
| Number Rotation Pool | PASS | MOCK VERIFIED | Multi-number pool & strategies verified |
| Campaign Results & Cursor Pagination | PASS | MOCK VERIFIED | Tested line reconciliation |
| UI (List, Wizard, Detail, Modals) | PASS | BUILD VERIFIED | Next.js Turbopack build passed |
| Security (RBAC, RLS, Tenant Isolation)| PASS | MOCK VERIFIED | Multi-tenant isolation verified |
| Live Provider Read Probing | PASS | LIVE READ VERIFIED | Connection & capability probes PASS |
| Live Outbound Dialing Mutation | NOT RUN | SAFE POLICY | Explicit opt-in safety guard |
| PostgreSQL / PGlite Driver | PASS | MOCK & DB VERIFIED | 7 migrations applied cleanly |

---

## 17. Known Limitations & Next Phase

### Known Limitations:
1. **Live Mutations Guarded:** In compliance with Section 44 and 61 of the specification, live bulk dialer dispatch was not triggered against live PSTN phone lines during automated CI/build execution.
2. **Provider Live Status Polling:** OmniDimension live status uses controlled polling rather than WebSockets, as the upstream provider API is REST-based.

### Next Phase:
- **Phase 6 — CRM & Leads Engine:** Introduce leads tables, lead pipelines, Meta Ads webhook ingestion, CRM customer profiles, and correlate campaign contacts with persistent CRM identities via `metadata.external_id`.
- **Phase 7 — Billing & Razorpay Integration:** Deduct per-minute wallet usage and charge for bulk campaigns based on the call durations and records captured in Phase 4 and Phase 5.
