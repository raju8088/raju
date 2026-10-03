# VoiceNuvo — Multi-Tenant AI Voice SaaS Platform

> Enterprise AI Voice Calling, Bulk Campaigns, CRM Lead Ingestion, and Multi-Tenant SaaS Monetization Engine. Built with Next.js 16 (App Router + Turbopack), React 19, TypeScript, Vanilla CSS design system, PostgreSQL (pg.Pool / PGlite) with Row-Level Security (RLS), OmniDimension Voice Engine, Meta Lead Ads, and Razorpay Payments.

---

## Platform Status: PHASE 8 PRODUCTION HARDENED (`CONDITIONALLY_READY`)

- **Full Vitest Test Suite:** **255/255 passed** across 24 test suites (0 failures, 0 skipped)
- **TypeScript:** **0 errors** (`npx tsc --noEmit` passes cleanly without build prerequisites)
- **ESLint:** **0 errors / 0 warnings** (`npm run lint` clean)
- **Next.js Production Build:** **PASS** (70 statically and dynamically optimized routes compiled successfully)
- **Launch Status:** **CONDITIONALLY_READY** — Code, schema, migrations, guardrails, and test suites fully verified; production deployment requires remote database provisioning and provider secret configuration.

---

## Phase Implementation & Verification Checklist

- [x] **Phase 1 — Foundation & Core Multi-Tenancy**
  - Next.js 16 App Router architecture, RBAC (`MAIN_ADMIN`, `ORG_ADMIN`, `EMPLOYEE`), session security, audit logs.
- [x] **Phase 2 — Database Persistence, Security & RLS**
  - Dual PostgreSQL driver (`pg.Pool` remote / embedded `pglite` disk), zero in-memory fallback, engine-level RLS policies.
- [x] **Phase 2.1 & 2.2 — PostgreSQL / Supabase Remote Verification**
  - SSL negotiation, fail-fast production startup validator, schema migrations (001–004), driver health probe.
- [x] **Phase 3 & 3.1 — OmniDimension Voice Integration & Live Provider Testing**
  - Provider connection vault with AES-256-GCM encryption at rest, voice agent lifecycle & version control, knowledge base file attachments, phone number search/purchase inventory, provider catalog caching.
- [x] **Phase 4 — Calling Engine & Telemetry**
  - Single call dispatch, webhook callbacks, live call status tracking, duration and billable minute calculations, call recordings & transcripts.
- [x] **Phase 5 — Bulk Calling & Campaign Engine**
  - Multi-tenant campaigns, calling window scheduler, concurrency limiter, contact list processor, real-time campaign metrics.
- [x] **Phase 6 — CRM, Lead Management & Meta Lead Ads**
  - Custom lead pipelines, instant lead capture, Meta Graph API webhook ingestion with HMAC-SHA256 verification, lead assignment, call/campaign correlation, CSV import/export.
- [x] **Phase 7 — Billing, Monetization & Razorpay Integration**
  - Multi-tenant wallets, prepaid credits, usage rating engine, plan/subscription tiers, Razorpay payment verification, webhook idempotency, PDF invoices.
- [x] **Phase 8 — Production Hardening & Launch Readiness**
  - IDOR protection tests, wallet overdraft prevention, webhook replay guardrails, error sanitization, PII masking, production runbook (`PRODUCTION_RUNBOOK.md`), CI workflow (`.github/workflows/ci.yml`), 255/255 Vitest suite pass.

---

## Git Commit History & Milestone Tracking

| Commit | Description | Scope |
| :--- | :--- | :--- |
| `b30ee6b` | `feat: VoiceNuvo Phase 1-7 complete implementation` | Complete core product (Auth, DB, OmniDimension, Calling, Campaigns, CRM, Billing) |
| `a56f2d7` | `feat: Phase 8 - Production hardening, security, CI, runbooks` | Production security suites, GitHub Actions CI, operations runbook, security headers |
| `242e1d9` | `fix(tests): resolve remaining 2 tests for full 255/255 Vitest suite pass` | Resolved remaining infrastructure tests to achieve 255/255 Vitest pass |

---

## Architecture Overview

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx               # Session login with role switching
│   │   └── register/page.tsx            # Company registration & tenant bootstrap
│   ├── dashboard/                       # Protected SaaS workspace
│   │   ├── admin/billing/               # Platform-wide revenue & reconciliation audit
│   │   ├── admin/plans/                 # SaaS subscription plan management
│   │   ├── agents/                      # Voice agents & versioning
│   │   ├── billing/usage/               # Tenant wallet, invoices, transactions
│   │   ├── calls/                       # Call logs, recordings & transcripts
│   │   ├── campaigns/                   # Bulk outbound campaign engine
│   │   ├── contacts/                    # Contact books & lists
│   │   ├── knowledge-base/              # Agent knowledge documents
│   │   ├── leads/                       # CRM lead board & timeline
│   │   ├── organizations/               # Main Admin multi-tenant management
│   │   ├── phone-numbers/               # Telephony inventory & routing
│   │   ├── settings/                    # Integration keys, Meta & OmniDimension
│   │   └── users/                       # Team members & invitations
│   ├── api/                             # REST API endpoints (70+ routes)
│   ├── globals.css                      # Design tokens & core styling
│   └── layout.tsx                       # Root layout (self-contained types)
├── components/                          # UI components & dashboard navigation
├── lib/
│   ├── auth/                            # Session cookies & cryptographic tokens
│   ├── config/env.ts                    # Startup validation & fail-fast production guards
│   ├── db/                              # DB driver, migrations runner (001–009), repositories
│   ├── permissions/                     # RBAC & bidirectional tenant isolation
│   ├── providers/                       # OmniDimension, Meta Graph API, Razorpay
│   └── utils/                           # AES-256-GCM encryption, structured logger, API responses
├── services/                            # Domain services (Calling, CRM, Campaigns, Billing, Wallets)
└── proxy.ts                             # Next.js route protection & webhook bypass
```

---

## Demo Accounts (Development)

Password for all pre-seeded development accounts: `Password123!`

| Role | Email | Tenant / Organization | Description |
| :--- | :--- | :--- | :--- |
| **MAIN_ADMIN** | `admin@voicenuvo.com` | VoiceNuvo Platform | Global Platform Super Admin |
| **ORG_ADMIN** | `orgadmin@acme.com` | Acme Voice Corp | Tenant A Administrator |
| **EMPLOYEE** | `employee@acme.com` | Acme Voice Corp | Tenant A Restricted Team Member |
| **ORG_ADMIN** | `admin@globex.com` | Globex Telephony | Tenant B Administrator (Isolated) |
| **EMPLOYEE** | `worker@globex.com` | Globex Telephony | Tenant B Team Member |

---

## Verification & Development Commands

```bash
# 1. Install dependencies
npm install

# 2. Run full test suite (255/255 tests passing across 24 suites)
npx vitest run

# 3. Run typecheck (clean without prior build step)
npx tsc --noEmit

# 4. Run linter
npm run lint

# 5. Run Next.js production build
npm run build

# 6. Start development server
npm run dev
```
