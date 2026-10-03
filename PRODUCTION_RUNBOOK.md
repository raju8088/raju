# VoiceNuvo — Production Operations Runbook

**Version:** Phase 8  
**Service:** VoiceNuvo SaaS — Multi-tenant AI Voice Calling Platform  
**Stack:** Next.js 16 (App Router), PostgreSQL/Supabase, OmniDimension, Razorpay, Meta Lead Ads  

---

> [!IMPORTANT]
> This runbook contains operational procedures. It must NEVER contain real secrets,
> API keys, database passwords, or provider credentials.
> Reference your deployment platform's secret store for actual values.

---

## Table of Contents

1. [Deployment](#1-deployment)
2. [Environment Configuration](#2-environment-configuration)
3. [Database Migrations](#3-database-migrations)
4. [Health Checks](#4-health-checks)
5. [Provider Verification](#5-provider-verification)
6. [Payment Verification](#6-payment-verification)
7. [Rollback Procedure](#7-rollback-procedure)
8. [Incident Handling](#8-incident-handling)
9. [Backup & Restore](#9-backup--restore)
10. [Secret Rotation](#10-secret-rotation)
11. [Webhook Troubleshooting](#11-webhook-troubleshooting)
12. [Billing Reconciliation](#12-billing-reconciliation)
13. [Provider Support Contacts](#13-provider-support-contacts)

---

## 1. Deployment

### Pre-deployment Checklist
Before every production deployment, verify:

```
[ ] npx tsc --noEmit         → 0 errors
[ ] npm run lint              → 0 errors
[ ] npx vitest run            → 0 failures
[ ] npm run build             → build succeeds
[ ] Secret scan               → no credentials in source
[ ] Migration validated       → migrations are idempotent
[ ] DATABASE_URL configured   → real PostgreSQL URL set
[ ] Secrets rotated           → all keys are current
```

### Deployment Steps (Vercel / Railway / Render)

1. **Merge PR to `main`** after all CI gates pass.
2. **Trigger deployment** via your platform (automatic on push to main in most setups).
3. **Monitor build logs** for compilation errors.
4. **Run migrations** (see Section 3) before routing traffic to the new instance.
5. **Verify health check**: `curl https://app.voicenuvo.com/api/health`
6. **Run smoke test** (see Section 4).
7. **Monitor error rate** for 15 minutes post-deployment.

### Environment Variables Required for Production

| Variable | Classification | Required |
|----------|---------------|---------|
| `NODE_ENV` | SERVER_ONLY | Yes (= `production`) |
| `NEXT_PUBLIC_APP_URL` | PUBLIC | Yes |
| `SESSION_SECRET` | SECRET | Yes (≥32 chars) |
| `DATABASE_URL` | SECRET | Yes (postgresql://) |
| `ENCRYPTION_KEY` | SECRET | Yes (64 hex chars) |
| `OMNIDIM_API_KEY` | SECRET | Yes (for calling) |
| `OMNIDIM_WEBHOOK_SECRET` | SECRET | Recommended |
| `RAZORPAY_KEY_ID` | SERVER_ONLY | Yes (for billing) |
| `RAZORPAY_KEY_SECRET` | SECRET | Yes (for billing) |
| `RAZORPAY_WEBHOOK_SECRET` | SECRET | Yes (for billing) |
| `META_PAGE_ACCESS_TOKEN` | SECRET | Optional |
| `META_WEBHOOK_VERIFY_TOKEN` | SECRET | Optional |
| `SEED_DEMO_DATA` | SERVER_ONLY | Must be `false` |
| `APP_VERSION` | SERVER_ONLY | Recommended |

---

## 2. Environment Configuration

### Development
- Copy `.env.example` → `.env.local`
- Fill in dev/test credentials (never production keys)
- `SEED_DEMO_DATA=true` is safe in development

### Staging
- Separate database from production
- Separate OmniDimension credentials (or test account)
- Razorpay **test** keys (`rzp_test_*`)
- `SEED_DEMO_DATA=true` acceptable
- Separate Meta test page/webhook

### Production
- All secrets stored in deployment platform's secure vault
- `SEED_DEMO_DATA=false` (enforced at startup)
- Razorpay **live** keys (`rzp_live_*`)
- HTTPS enforced
- All webhook endpoints pointing to production URL

---

## 3. Database Migrations

### Migration Files (applied in order)
```
001_initial_schema.sql         — Core schema, organizations, users
002_rls_policies.sql           — Row-level security policies
003_seed_data.sql              — Development seed (guarded by SEED_DEMO_DATA)
004_audit_and_security.sql     — Audit logs, rate limits
005_omnidimension_phase3.sql   — Provider connections, voice agents
006_calling_phase4.sql         — Calls, call events
007_campaigns_phase5.sql       — Campaigns, campaign contacts
008_crm_leads_phase6.sql       — CRM, leads, contacts, lead sources
009_billing_monetization_phase7.sql — Billing tables, wallet, invoices
```

### Applying Migrations

Migrations are applied automatically at application startup via `ensureDatabaseReady()`.
They are idempotent — safe to run multiple times.

To verify migrations have been applied on a remote database:
```sql
-- Check that all migration markers exist:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Must include:
-- billing_invoices, billing_plans, billing_wallet_ledger,
-- billing_wallets, calls, campaign_contacts, campaigns,
-- contacts, leads, organizations, provider_connections,
-- usage_charges, usage_events, voice_agents
```

### Safety Rules
- **Never** run `DROP TABLE` or destructive DDL against production without a backup
- **Never** run test seed scripts against the production database
- Migrations prefer `CREATE TABLE IF NOT EXISTS` — they are additive only
- Production startup fails if `NODE_ENV=production` and `DATABASE_URL` is missing

---

## 4. Health Checks

### Liveness
```bash
curl https://app.voicenuvo.com/api/health?mode=live
# Expected: {"status":"alive","service":"voicenuvo",...}
```

### Readiness (full)
```bash
curl https://app.voicenuvo.com/api/health
# Expected: {"status":"healthy","checks":{"database":{"status":"OK"},...}}
```

### Smoke Test Checklist (post-deployment)
```bash
# 1. Health
curl -s https://app.voicenuvo.com/api/health | jq .status

# 2. Login endpoint (returns 400 for invalid credentials — not 500)
curl -s -X POST https://app.voicenuvo.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@test.invalid","password":"probe"}' | jq .success

# 3. Unauthenticated access returns 401
curl -s https://app.voicenuvo.com/api/agents | jq .error.code
# Expected: "UNAUTHORIZED"

# 4. Plans endpoint (public)
curl -s https://app.voicenuvo.com/api/billing/plans | jq .success
# Expected: true
```

---

## 5. Provider Verification

### OmniDimension
```bash
# Verify connectivity (safe read-only)
curl -s https://app.voicenuvo.com/api/integrations/voice/omnidimension/test \
  -H "Authorization: Bearer $SESSION_TOKEN"
# Expected: {"data":{"connected":true,"agentCount":...}}
```

**Do NOT dispatch a real call during initial verification.**  
Use the designated smoke-test number only with explicit approval.

### Meta (Facebook Lead Ads)
1. Confirm webhook URL is registered: `https://app.voicenuvo.com/api/webhooks/meta/leadgen`
2. Send a webhook verification challenge via Meta Developer Console
3. Verify challenge response returns `hub.challenge` value

### Razorpay
1. Verify test mode: create a test order → complete with test card `4111111111111111`
2. Confirm webhook delivery in Razorpay dashboard
3. Verify wallet credit appears in `/api/billing/wallet`

---

## 6. Payment Verification

### Pre-production Checklist
```
[ ] Test mode verified (rzp_test_* keys working)
[ ] Webhook signature verification passing (HMAC-SHA256)
[ ] Duplicate webhook test: same event delivered twice → only processed once
[ ] Wallet credit idempotency tested
[ ] Invoice generation tested
```

### Switching to Live Mode
1. Obtain live keys from Razorpay Dashboard
2. Store `RAZORPAY_KEY_ID=rzp_live_*` and `RAZORPAY_KEY_SECRET` in secrets vault
3. Update `RAZORPAY_WEBHOOK_SECRET` to live webhook secret
4. Set feature flag `FEATURE_RAZORPAY_LIVE=true` in deployment
5. Verify `/api/health` still reports `razorpay: CONFIGURED`
6. Perform a minimal ₹1 test transaction with explicit approval

---

## 7. Rollback Procedure

### Application Rollback (Vercel / Railway)
Most platforms maintain a deployment history with instant rollback:

```
Vercel:   Dashboard → Deployments → Previous deployment → Redeploy
Railway:  Dashboard → Deployments → Re-deploy previous
Render:   Dashboard → Manual Deploy → Earlier commit SHA
```

### Database Rollback
**VoiceNuvo migrations are additive only (no destructive DDL).**  
Schema cannot be rolled backward — only forward.

If a migration caused a problem:
1. Deploy the application rollback first (the old application code works with the new schema)
2. Write a forward-fix migration (e.g. `010_forward_fix.sql`) if schema repair is needed
3. Never attempt to manually reverse migrations on production

### Webhook Configuration Rollback
If a provider webhook was misconfigured:
1. Update webhook URL in provider dashboard
2. Replay buffered events from provider (if supported)
3. Use `billing_webhook_events` idempotency table — replays are safe

---

## 8. Incident Handling

### Database Outage
1. Health endpoint returns `503` — monitor.
2. Check Supabase status at `https://status.supabase.com`
3. Application returns 503 to clients — no silent fallback to PGlite
4. No data loss from the application side — database owns the data
5. Recovery: Database comes back → application reconnects automatically

### OmniDimension Outage
1. Call dispatch fails with `PROVIDER_UNAVAILABLE` error
2. In-progress campaigns pause (not cancel)
3. Dashboard CRM/leads continue to work from local DB
4. Stale provider data is labeled accordingly in UI
5. Recovery: Provider returns → retry any queued dispatches

### Razorpay Outage
1. Payment creation returns error — no silent success
2. Wallet top-up shows `PENDING` until verified
3. Webhook delivery may be delayed — Razorpay retries for 24h
4. Recovery: Razorpay retries webhook → idempotency table prevents duplicates

### Billing Reconciliation Mismatch
1. Run: `GET /api/admin/billing/reconciliation`
2. Identify discrepancies in the response
3. Do NOT manually edit wallet balances or ledger records
4. Open a support ticket with Razorpay for payment disputes
5. Use `MANUAL_ADMIN` wallet adjustment only for verified corrections

### High API Error Rate (>5% 5xx)
1. Check `/api/health` — confirm database is reachable
2. Check deployment logs for unhandled exceptions
3. Roll back if error started after recent deployment
4. Escalate if database latency is the cause

### Secret Compromise
See Section 10 — Secret Rotation.

---

## 9. Backup & Restore

### Supabase Automated Backups
- **Free tier:** Daily backups, 7-day retention
- **Pro tier:** Daily backups, 30-day retention + Point-in-Time Recovery (PITR)
- Location: Supabase Dashboard → Database → Backups

### Manual Backup (pg_dump)
```bash
# Substitute correct connection string (from secrets vault — never hardcode)
pg_dump "$(DATABASE_URL)" \
  --format=custom \
  --no-acl \
  --no-owner \
  --file="voicenuvo_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Restore Drill Procedure
Perform restore drills against a **temporary/staging** database only.

```bash
# 1. Create a temporary database for the drill
# (via Supabase dashboard or pg CLI — never against production)

# 2. Restore the backup
pg_restore \
  --dbname="$STAGING_DATABASE_URL" \
  --no-acl \
  --no-owner \
  voicenuvo_backup_YYYYMMDD.dump

# 3. Run schema validation
psql "$STAGING_DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;"

# 4. Run application health check against staging
NODE_ENV=production DATABASE_URL=$STAGING_DATABASE_URL \
  curl http://localhost:3000/api/health

# 5. Verify critical tables have expected row counts
psql "$STAGING_DATABASE_URL" -c "
  SELECT 'organizations' AS t, COUNT(*) FROM organizations
  UNION ALL SELECT 'calls', COUNT(*) FROM calls
  UNION ALL SELECT 'billing_wallets', COUNT(*) FROM billing_wallets
  UNION ALL SELECT 'billing_wallet_ledger', COUNT(*) FROM billing_wallet_ledger;"

# 6. Verify tenant isolation (org A cannot see org B)
# Run tests/tenant-isolation.test.ts against staging DB

# 7. Destroy the temporary database
# (via Supabase dashboard)
```

### RTO / RPO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RPO (Recovery Point Objective) | 24 hours | Supabase daily backup |
| RPO (with PITR on Pro plan) | ~1 minute | Supabase PITR |
| RTO (Recovery Time Objective) | 2-4 hours | Restore + verification |
| RTO (application rollback only) | 5 minutes | Vercel/Railway re-deploy |

---

## 10. Secret Rotation

### When to Rotate
- Suspected compromise
- Developer offboarding
- Periodic rotation (quarterly recommended)
- Provider forces rotation
- Key appears in logs or source code

### Rotation Procedure

#### SESSION_SECRET
1. Generate new value: `openssl rand -base64 48`
2. Update in deployment secrets vault
3. Redeploy application
4. Existing sessions are invalidated — users must re-login
5. Verify `/api/health` still returns healthy

#### ENCRYPTION_KEY (Provider API Keys at Rest)
> ⚠️ WARNING: Rotating ENCRYPTION_KEY requires re-encrypting all stored provider keys.
1. Generate new key: `openssl rand -hex 32`
2. Write a migration script to decrypt with old key + re-encrypt with new key
3. Test on staging first
4. Apply migration on production during maintenance window
5. Update ENCRYPTION_KEY in secrets vault
6. Redeploy

#### OMNIDIM_API_KEY
1. Generate new API key in OmniDimension Dashboard
2. Test new key connectivity
3. Update in secrets vault
4. Redeploy
5. Revoke old key in OmniDimension Dashboard
6. Verify provider connection via `/api/integrations/voice/omnidimension/test`

#### RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
1. Generate new keys in Razorpay Dashboard
2. Update in secrets vault
3. Redeploy
4. Update webhook secret in Razorpay Dashboard webhook settings
5. Verify next webhook delivery succeeds
6. Revoke old keys

#### DATABASE_URL Password
1. Rotate via Supabase Dashboard → Database → Password Reset
2. Update `DATABASE_URL` in secrets vault
3. Redeploy
4. Verify `/api/health` reports `database: OK`

---

## 11. Webhook Troubleshooting

### Razorpay Webhook Not Arriving
1. Check Razorpay Dashboard → Webhooks → Events log
2. Verify webhook URL: `https://app.voicenuvo.com/api/webhooks/razorpay`
3. Verify `RAZORPAY_WEBHOOK_SECRET` matches Dashboard webhook secret
4. Check `billing_webhook_events` table for received events:
   ```sql
   SELECT provider_event_id, event_type, processing_status, received_at
   FROM billing_webhook_events
   ORDER BY received_at DESC LIMIT 20;
   ```
5. Check application logs for `RAZORPAY_WEBHOOK_ERROR` entries

### OmniDimension Webhook Not Updating Call Status
1. Verify `OMNIDIM_WEBHOOK_SECRET` matches what is configured in OmniDimension
2. Check application logs for `WEBHOOK_UNAUTHORIZED_ATTEMPT`
3. Verify webhook URL is `https://app.voicenuvo.com/api/webhooks/omnidimension/call`
4. Check call record in database:
   ```sql
   SELECT id, provider_call_id, status, duration_seconds, updated_at
   FROM calls WHERE provider_call_id = 'YOUR_CALL_ID';
   ```

### Meta Webhook Not Delivering Leads
1. Verify webhook verification challenge passes
2. Check Meta Webhook → Recent Deliveries
3. Verify `META_WEBHOOK_VERIFY_TOKEN` is correct
4. Check `external_lead_events` table for received payloads
5. Check leads created after the delivery time

---

## 12. Billing Reconciliation

### Automated Reconciliation
```bash
# Run via API (requires MAIN_ADMIN authentication)
curl -s https://app.voicenuvo.com/api/admin/billing/reconciliation \
  -H "Authorization: Bearer $ADMIN_SESSION_TOKEN" | jq .
```

### Manual Reconciliation Checks
```sql
-- 1. Wallet integrity: balance must equal sum of ledger entries
SELECT
  w.organization_id,
  w.balance_minor,
  COALESCE(SUM(l.amount_minor), 0) AS ledger_sum,
  w.balance_minor = COALESCE(SUM(l.amount_minor), 0) AS is_balanced
FROM billing_wallets w
LEFT JOIN billing_wallet_ledger l ON l.wallet_id = w.id
GROUP BY w.organization_id, w.balance_minor;

-- 2. Unbilled completed calls
SELECT c.id, c.provider_call_id, c.duration_seconds, c.completed_at
FROM calls c
WHERE c.status = 'COMPLETED'
  AND c.duration_seconds > 0
  AND NOT EXISTS (
    SELECT 1 FROM usage_events ue WHERE ue.provider_call_id = c.provider_call_id
  )
ORDER BY c.completed_at DESC;

-- 3. Uncharged usage events
SELECT ue.id, ue.provider_call_id, ue.billable_quantity
FROM usage_events ue
WHERE NOT EXISTS (
  SELECT 1 FROM usage_charges uc WHERE uc.usage_event_id = ue.id
)
ORDER BY ue.created_at DESC;
```

---

## 13. Provider Support Contacts

| Provider | Support URL | Notes |
|----------|------------|-------|
| OmniDimension | https://omnidimension.ai/support | Include provider_call_id in tickets |
| Razorpay | https://razorpay.com/support | Include order_id and payment_id |
| Meta / Facebook | https://developers.facebook.com/support | Include webhook event_id |
| Supabase | https://supabase.com/support | Include project ref |

---

*This runbook was generated as part of Phase 8 — Production Readiness for VoiceNuvo.*  
*Keep it updated as procedures evolve. Never include real credentials.*
