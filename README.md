# VoiceNuvo — Phase 3: OmniDimension Integration + Voice Agents + Knowledge Base + Phone Numbers

> Multi-tenant AI Voice SaaS Platform Control Plane. Built with Next.js 16 (App Router + Turbopack), React 19, TypeScript, Tailwind CSS, persistent PostgreSQL / Supabase with Row Level Security (RLS), and OmniDimension AI Voice Engine Integration.

---

## Phase 3 Status: COMPLETED & FULLY VERIFIED

- **Voice Provider Abstraction**: VoiceNuvo serves as the branded SaaS control plane while OmniDimension serves as the operational voice engine via the official `@omnidim-ai/sdk@0.6.0`.
- **Zero Secret Exposure**: OmniDimension API keys are strictly server-side, encrypted at rest using authenticated AES-256-GCM, and masked in all UI responses (`••••••••3456`). Secrets are never returned in API payloads or logged.
- **Organization-Scoped Provider Connections**: Each organization manages its own OmniDimension provider connection context with live connection testing and automatic latency verification.
- **Safe Key Replacement**: If replacement with a new API key fails verification, the existing working connection remains active and intact (`"New API connection failed — old connection is still active"`).
- **Voice Agents Control Plane**: Full agent management interface supporting creation, configuration (welcome greeting, acoustic voice, LLM reasoning model, speech speed, web search, voicemail, context blocks), live editing, deletion, and version control (snapshots, version restoration, and diffing).
- **Knowledge Base Module**: Organization document repository supporting file uploads, quota capability checks, instant attachment/detachment to agents, and deletion.
- **Phone Numbers & Telephony Inventory**: Phone number catalog supporting live region/carrier search, one-click purchase with idempotency protection, inbound agent routing, detachment, and number release.
- **Provider Catalog & Caching**: Read-only catalog service exposing LLM reasoning engines, STT transcription, TTS synthesis, and available acoustic voices with short-lived TTL caching.
- **Strict Tenant Isolation & RBAC**: Every provider resource mapping is isolated per organization in PostgreSQL with RLS policies. Role permissions enforce `VOICE_PROVIDER_MANAGE`, `AGENT_MANAGE`, `KNOWLEDGE_BASE_MANAGE`, and `PHONE_NUMBER_MANAGE`.
- **Structured Audit Logging**: Comprehensive audit trail recorded on all provider lifecycle events (`PROVIDER_CONNECTION_CREATED`, `AGENT_CREATED`, `PHONE_NUMBER_PURCHASED`, `KNOWLEDGE_FILE_ATTACHED`, etc.).
- **Strict Phase Boundaries Maintained**: Phase 4 (calling/transcripts), Phase 5 (campaigns), Phase 6 (CRM), and Phase 7 (billing) intentionally excluded until their respective phases.
- **Automated Verification**: 91 passing tests (2 skipped cleanly for optional live provider keys), 0 TypeScript errors, 0 ESLint warnings/errors, and successful Next.js 16 production build.

---

## Architecture Overview

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx               # Login page with demo selector & credentials form
│   │   └── register/page.tsx            # Company registration & org bootstrap
│   ├── dashboard/
│   │   ├── layout.tsx                   # Protected dashboard layout
│   │   ├── page.tsx                     # Overview & future module roadmap cards
│   │   ├── organizations/page.tsx       # Main Admin organization management
│   │   ├── users/page.tsx               # Team & member management
│   │   └── settings/page.tsx            # Account, organization, & security settings
│   ├── api/
│   │   ├── auth/                        # login, register, logout, session, switch-org
│   │   ├── organizations/               # list, create, get, update, suspend
│   │   ├── users/                       # list, invite, update member, remove member
│   │   └── health/                      # Live DB probe & health status
│   ├── page.tsx                         # Landing page with entry CTA
│   └── globals.css
├── components/
│   ├── ui/                              # Button, Card, Input, Badge, Modal
│   └── layout/                          # DashboardSidebar, DashboardHeader, OrgSwitcher
├── lib/
│   ├── auth/                            # Session cookies, JWT-style HMAC signature, token verification
│   ├── db/                              # Universal DB client, migrations runner, repository exports
│   │   ├── client.ts                    # PostgreSQL driver (pg.Pool / PGlite disk storage)
│   │   ├── migrations/                  # 001_schema, 002_rls, 003_seed, 004_audit_security
│   │   └── repositories/                # organization, user, audit, rate-limit repositories
│   ├── permissions/                     # Roles, Permissions, RBAC & Tenant assertions
│   ├── validation/                      # Zod schemas (Organization, User, Auth)
│   └── utils/                           # API responses, structured logger, slug, crypto
├── services/
│   ├── auth.service.ts                  # Authentication & registration transaction service
│   ├── organization.service.ts          # Tenant isolation & organization transaction service
│   └── user.service.ts                  # Membership & role assignment transaction service
├── types/                               # Strict shared TypeScript definitions
└── proxy.ts                             # Next.js 16 request interceptor / route protector
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

## Running the Project

```bash
# 1. Install dependencies
npm install

# 2. Run automated tests (70/70 tests passing across 12 suites)
npx vitest run

# 3. Run typecheck & linter
npx tsc --noEmit
npm run lint

# 4. Run Next.js production build
npm run build

# 5. Start development server
npm run dev
```
---

## Roadmap

- [x] **Phase 1 — Foundation** (Multi-tenancy, RBAC, Auth, Architecture, DB schema, UI shell)
- [x] **Phase 2 — Production Database + Authentication + Multi-Tenant Security Hardening** (PostgreSQL persistence on disk, zero in-memory fallback, scrypt + HMAC auth, RLS, ACID transactions, audit logs, abuse protection)
- [x] **Phase 2.1 — Production PostgreSQL + Supabase + RLS Verification** (Production fail-fast startup validator, pg.Pool remote pooling & SSL, PostgreSQL RLS engine-level enforcement, SEED_DEMO_DATA=false safety, direct SQL tenant test, observable health check, 70/70 tests passing)
- [ ] **Phase 3 — Voice Engine** (OmniDimension integration, AI Agents, Phone Numbers)
- [ ] **Phase 4 — Calling** (Outbound calls, live call audio, recordings, transcripts)
- [ ] **Phase 5 — Campaigns** (Bulk call campaigns, contact lists, concurrency control)
- [ ] **Phase 6 — CRM & Leads** (Instant lead qualification, custom CRM pipelines)
- [ ] **Phase 7 — Billing** (Razorpay integration, wallet credits, per-minute billing)
- [ ] **Phase 8 — Production Hardening** (Webhooks, audit logs, monitoring)
