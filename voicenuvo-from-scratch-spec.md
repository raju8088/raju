# VoiceNuvo --- From-Scratch Product Specification

## 1. Document Purpose

This document defines the technical and product specification for
building **VoiceNuvo** from scratch as a branded multi-tenant AI voice
platform.

The goal is to build the VoiceNuvo application layer and SaaS control
plane while integrating with OmniDimension as the underlying
voice/calling engine where applicable.

The system should support:

-   Main Admin
-   Child Organizations / Clients
-   Admin and Employee users
-   AI Voice Agents
-   Knowledge Bases
-   Phone Numbers
-   Outbound Calls
-   Bulk Call Campaigns
-   Call Logs
-   Recordings and Transcripts
-   Usage-based billing
-   Wallet / Credits
-   Subscription plans
-   Role-based permissions
-   White-label branding
-   API integrations
-   Audit and operational controls

------------------------------------------------------------------------

# 2. Product Vision

VoiceNuvo is a multi-tenant AI calling SaaS platform that allows
businesses to:

1.  Create and manage AI voice agents.
2.  Connect phone numbers.
3.  Make inbound and outbound calls.
4.  Run bulk calling campaigns.
5.  Automatically qualify leads.
6.  View call history, recordings and transcripts.
7.  Manage employees and permissions.
8.  Track usage and billing.
9.  Purchase/top-up credits.
10. Integrate CRM, forms, advertising leads and external systems.

The platform should feel like a standalone VoiceNuvo product rather than
a thin wrapper around a third-party dashboard.

------------------------------------------------------------------------

# 3. Core Architecture

## 3.1 High-Level Architecture

``` text
                         VOICENUVO
                             |
              +--------------+--------------+
              |                             |
        Frontend Application          Backend API
              |                             |
              |                    +--------+--------+
              |                    |                 |
              |                PostgreSQL       Integration
              |                    |              Layer
              |                    |                 |
              |                    |          OmniDimension API
              |                    |                 |
              |                    |          Webhooks
              |                    |
              +--------------------+
```

## 3.2 Recommended Stack

### Frontend

-   Next.js
-   React
-   TypeScript
-   Tailwind CSS
-   Component library
-   Responsive dashboard UI

### Backend

-   Node.js
-   TypeScript
-   Next.js API routes or dedicated backend service
-   REST APIs
-   Background workers for asynchronous jobs

### Database

-   PostgreSQL
-   Supabase is recommended for the initial implementation

### Authentication

-   Clerk, Supabase Auth, or equivalent
-   MFA support for privileged users

### Payments

-   Razorpay for India-first payments
-   Subscription support
-   Wallet/top-up support
-   Payment webhook processing

### Hosting

-   Vercel for frontend
-   Render / Railway / AWS for backend workers where required
-   Supabase for database

------------------------------------------------------------------------

# 4. Multi-Tenant Architecture

VoiceNuvo must be multi-tenant from the beginning.

## 4.1 Tenant Hierarchy

``` text
Main Admin
    |
    +-- Organization A
    |      |
    |      +-- Admin
    |      +-- Employee
    |      +-- Agents
    |      +-- Numbers
    |      +-- Campaigns
    |      +-- Billing
    |
    +-- Organization B
           |
           +-- Admin
           +-- Employees
           +-- Agents
           +-- Numbers
           +-- Campaigns
           +-- Billing
```

## 4.2 Tenant Isolation

Every tenant-owned database record must contain:

``` text
organization_id
```

Tenant access must be enforced at the database and API layers.

A user from Organization A must never be able to access Organization
B's:

-   Agents
-   Calls
-   Recordings
-   Transcripts
-   Numbers
-   Campaigns
-   Contacts
-   Billing
-   Employees
-   API credentials

------------------------------------------------------------------------

# 5. User Roles

## 5.1 Main Admin

Global VoiceNuvo operator.

Permissions:

-   Manage organizations
-   Create organizations
-   Suspend organizations
-   Manage subscriptions
-   Manage pricing
-   Manage credits
-   View system-wide usage
-   Configure API connections
-   Assign agents
-   Assign phone numbers
-   View system audit logs
-   Manage white-label configuration

## 5.2 Organization Admin

Customer administrator.

Permissions:

-   Manage organization users
-   Create employees
-   Manage agents
-   Manage phone numbers
-   Create campaigns
-   View calls
-   View recordings
-   View transcripts
-   Manage knowledge bases
-   View usage
-   Manage billing where permitted

## 5.3 Employee

Restricted operational user.

Permissions should be configurable.

Examples:

-   View leads
-   View calls
-   Start campaigns
-   View recordings
-   View transcripts
-   Manage assigned agents

Employees should not be able to:

-   Change organization API keys
-   Delete the organization
-   Modify billing
-   Access other organizations

------------------------------------------------------------------------

# 6. Authentication

Required features:

-   Sign up
-   Login
-   Logout
-   Password reset
-   Email verification
-   Session management
-   MFA for privileged accounts
-   Role-based authorization
-   Organization membership
-   Account suspension

Recommended middleware:

``` text
Request
   |
Authentication
   |
User lookup
   |
Organization lookup
   |
Role/permission check
   |
Controller
```

------------------------------------------------------------------------

# 7. Database Design

## 7.1 organizations

Fields:

``` text
id
name
slug
logo_url
brand_name
status
plan_id
created_at
updated_at
```

Statuses:

``` text
ACTIVE
SUSPENDED
BIN
REMOVED
```

## 7.2 users

``` text
id
email
name
phone
auth_provider_id
status
created_at
updated_at
```

## 7.3 organization_members

``` text
id
organization_id
user_id
role
status
created_at
```

## 7.4 roles

``` text
id
organization_id
name
description
```

## 7.5 permissions

``` text
id
key
description
```

## 7.6 role_permissions

``` text
role_id
permission_id
```

## 7.7 api_connections

``` text
id
organization_id
provider
encrypted_api_key
status
last_verified_at
last_error
created_at
updated_at
```

API keys must never be stored in plaintext.

------------------------------------------------------------------------

# 8. OmniDimension Integration Layer

VoiceNuvo should use a dedicated provider abstraction.

``` text
VoiceNuvo Application
        |
Provider Interface
        |
+-------+----------------+
|                        |
OmniDimension Provider   Future Provider
```

Example interface:

``` typescript
interface VoiceProvider {
  listAgents(): Promise<any>;
  createAgent(data: any): Promise<any>;
  updateAgent(id: string, data: any): Promise<any>;
  deleteAgent(id: string): Promise<any>;

  listPhoneNumbers(): Promise<any>;
  attachPhoneNumber(data: any): Promise<any>;

  dispatchCall(data: any): Promise<any>;
  getCallLogs(params?: any): Promise<any>;

  createCampaign(data: any): Promise<any>;
  addContact(campaignId: string, data: any): Promise<any>;
}
```

This prevents the entire application from becoming tightly coupled to
one provider.

------------------------------------------------------------------------

# 9. API Connection Management

## Main Admin

Main Admin can:

-   Add provider API key
-   Verify API key
-   Activate connection
-   Replace API key
-   Disable connection

## Safe API-Key Switching

Required behavior:

``` text
New API Key
     |
Verify API
     |
  Success?
   /    \
 Yes     No
 |        |
Activate  Reject
 |        |
Old key  Old key
replaced remains active
```

If a new connection fails:

``` text
New API connection failed.
Old connection is still active.
```

Never destroy the working connection before the replacement is verified.

------------------------------------------------------------------------

# 10. Agent Management

Required features:

-   List agents
-   Create agent
-   View agent
-   Edit agent
-   Delete agent
-   Assign agent to organization
-   Assign phone number
-   Agent status
-   Agent version management
-   Restore previous version

Agent fields may include:

``` text
agent_id
organization_id
name
description
voice
language
system_prompt
welcome_message
llm_provider
stt_provider
tts_provider
knowledge_base_ids
status
created_at
updated_at
```

------------------------------------------------------------------------

# 11. Knowledge Base

Features:

-   Upload document
-   List documents
-   Delete document
-   Attach document to agent
-   Detach document from agent
-   Upload status
-   Processing status
-   File metadata

Supported formats can include:

-   PDF
-   TXT
-   DOCX
-   CSV

The UI must show:

``` text
Uploading
Processing
Ready
Failed
```

------------------------------------------------------------------------

# 12. Phone Number Management

Features:

-   List numbers
-   Search numbers
-   Purchase numbers
-   Import number
-   Release number
-   Attach number
-   Detach number
-   Assign number to organization
-   Assign number to agent
-   Number status

Recommended states:

``` text
AVAILABLE
ASSIGNED
ACTIVE
SUSPENDED
RELEASED
```

Number data:

``` text
id
organization_id
provider
phone_number
country
region
agent_id
status
created_at
```

------------------------------------------------------------------------

# 13. Calling System

## Outbound Call

Flow:

``` text
Lead
  |
VoiceNuvo
  |
Validate balance
  |
Validate agent
  |
Validate number
  |
Dispatch call
  |
Provider
  |
Call
```

Before dispatch:

1.  Check account status.
2.  Check wallet balance.
3.  Check minimum call balance.
4.  Validate agent.
5.  Validate caller number.
6.  Dispatch call.

------------------------------------------------------------------------

# 14. Call Logs

VoiceNuvo should treat the external voice provider as the operational
source of truth for call telemetry where possible.

Do not unnecessarily duplicate large recordings or transcripts.

Store references and metadata such as:

``` text
provider_call_id
organization_id
lead_id
campaign_id
agent_id
phone_number
status
duration
started_at
ended_at
```

Detailed operational information can be fetched from the provider when
required.

------------------------------------------------------------------------

# 15. Recordings

The UI must support:

-   Play recording
-   Recording duration
-   Recording URL/reference
-   Call date
-   Caller number
-   Agent
-   Campaign

If the provider returns temporary/signed URLs, VoiceNuvo should fetch a
fresh URL when the user requests playback.

------------------------------------------------------------------------

# 16. Transcripts

The UI should display:

``` text
Speaker
Timestamp
Transcript
```

Optional:

-   Search transcript
-   Download transcript
-   AI summary
-   Sentiment
-   Intent
-   Lead qualification
-   Extracted variables

------------------------------------------------------------------------

# 17. Bulk Campaign System

Features:

-   Create campaign
-   Select agent
-   Select caller number
-   Upload contacts
-   Add individual contact
-   Dynamic variables
-   Metadata
-   Start campaign
-   Pause campaign
-   Resume campaign
-   Cancel campaign
-   Retry failed contacts
-   Configure concurrency
-   Configure calling hours
-   View live status

Contact schema:

``` text
phone_number
name
company
reason_for_call
custom_variables
metadata
```

Phone numbers must be normalized to E.164 format.

Example:

``` text
+919876543210
```

------------------------------------------------------------------------

# 18. Campaign Architecture

``` text
Campaign
 |
 +-- Agent
 |
 +-- Caller Number
 |
 +-- Contact List
 |
 +-- Dynamic Variables
 |
 +-- Concurrency
 |
 +-- Calling Hours
 |
 +-- Retry Rules
 |
 +-- Results
```

Campaign states:

``` text
DRAFT
SCHEDULED
RUNNING
PAUSED
COMPLETED
CANCELLED
FAILED
```

------------------------------------------------------------------------

# 19. Lead Management

Lead sources:

-   Website form
-   Meta Lead Ads
-   Google Ads integrations
-   CRM
-   CSV
-   API
-   Manual entry

Lead fields:

``` text
id
organization_id
name
phone
email
source
campaign
status
assigned_agent
custom_fields
created_at
updated_at
```

Lead statuses:

``` text
NEW
CONTACTED
QUALIFIED
NOT_QUALIFIED
CALLBACK
CONVERTED
LOST
```

------------------------------------------------------------------------

# 20. Instant Lead Calling

For supported lead sources:

``` text
Lead submitted
      |
Webhook
      |
VoiceNuvo
      |
Create/Update Lead
      |
Check balance
      |
Dispatch call
      |
Call completed
      |
Save result
      |
CRM updated
```

Target behavior:

**Lead submission → AI call within seconds**, subject to provider
availability and configuration.

------------------------------------------------------------------------

# 21. Billing System

VoiceNuvo should support two billing dimensions:

1.  Subscription
2.  Usage

## Subscription

Example plans:

``` text
Starter
Growth
Pro
Enterprise
```

Plan fields:

``` text
name
monthly_price
included_minutes
max_users
max_agents
max_campaigns
features
```

## Usage

Usage can be calculated from:

``` text
billable_duration
×
per-minute rate
```

Example:

``` text
Call duration = 4.3 minutes
Rate = ₹7/minute

Charge = 4.3 × ₹7
       = ₹30.10
```

The exact billing rounding rule must be configurable.

------------------------------------------------------------------------

# 22. Wallet / Credits

Each organization should have a wallet.

``` text
wallet
wallet_transactions
usage_transactions
```

Transaction types:

``` text
TOP_UP
CALL_DEBIT
REFUND
ADMIN_CREDIT
ADMIN_DEBIT
REVERSAL
```

Every financial operation must be immutable.

Do not modify historical transactions.

Use reversal transactions instead.

------------------------------------------------------------------------

# 23. Billing Flow

``` text
Call starts
    |
Call completes
    |
Get actual duration
    |
Calculate billable amount
    |
Check previous reservation
    |
Finalize charge
    |
Wallet transaction
    |
Update balance
```

For long calls, optionally reserve estimated credits before starting.

------------------------------------------------------------------------

# 24. Razorpay Integration

Required:

-   Create order
-   Checkout
-   Payment verification
-   Webhook verification
-   Wallet top-up
-   Subscription payment
-   Failed payment handling
-   Refund handling
-   Payment history

Never trust frontend payment-success messages without server-side
verification.

------------------------------------------------------------------------

# 25. Dashboard

## Main Admin Dashboard

KPIs:

-   Total organizations
-   Active organizations
-   Total users
-   Active agents
-   Total calls
-   Total minutes
-   Revenue
-   Wallet liability
-   Failed calls
-   Provider status

## Organization Dashboard

KPIs:

-   Total leads
-   Calls today
-   Minutes used
-   Successful calls
-   Failed calls
-   Campaigns
-   Agent usage
-   Wallet balance

------------------------------------------------------------------------

# 26. Analytics

Required initial analytics:

-   Calls by day
-   Minutes by day
-   Calls by agent
-   Calls by campaign
-   Call success rate
-   Average call duration
-   Lead conversion
-   Cost by campaign
-   Cost by agent

Later:

-   Sentiment trends
-   Intent distribution
-   Conversation quality
-   AI-generated summaries
-   Conversion attribution

------------------------------------------------------------------------

# 27. Webhooks

Create a centralized webhook system.

``` text
Provider
   |
Webhook Gateway
   |
Verify signature
   |
Parse event
   |
Idempotency check
   |
Process event
   |
Update internal state
```

Webhook events may include:

``` text
CALL_STARTED
CALL_COMPLETED
CALL_FAILED
CAMPAIGN_UPDATED
CAMPAIGN_COMPLETED
PAYMENT_SUCCESS
PAYMENT_FAILED
```

Every webhook must have an idempotency key.

------------------------------------------------------------------------

# 28. Audit Logs

Record sensitive actions:

``` text
USER_LOGIN
API_KEY_CHANGED
ORGANIZATION_CREATED
USER_CREATED
ROLE_CHANGED
AGENT_CREATED
AGENT_DELETED
NUMBER_ASSIGNED
CAMPAIGN_STARTED
CAMPAIGN_CANCELLED
CREDIT_TRANSFER
BILLING_CHANGE
```

Audit record:

``` text
id
organization_id
user_id
action
resource_type
resource_id
metadata
ip_address
created_at
```

------------------------------------------------------------------------

# 29. Security Requirements

Required:

-   HTTPS
-   Encrypted API keys
-   Password hashing through auth provider
-   RBAC
-   Tenant isolation
-   API rate limiting
-   Input validation
-   SQL injection protection
-   XSS protection
-   CSRF protection where applicable
-   Secure webhook verification
-   Audit logging
-   Secrets stored in environment variables
-   No credentials in frontend
-   No provider API keys exposed to browsers

------------------------------------------------------------------------

# 30. Data Protection

Sensitive data should be minimized.

Do not permanently duplicate:

-   Audio recordings
-   Large transcripts
-   Provider operational telemetry

unless there is a clear product requirement.

Use provider IDs and live retrieval where practical.

------------------------------------------------------------------------

# 31. Error Handling

Every provider integration must normalize errors.

Example:

``` json
{
  "success": false,
  "code": "PROVIDER_CONNECTION_FAILED",
  "message": "Voice provider is temporarily unavailable.",
  "retryable": true
}
```

Frontend should never expose raw provider stack traces.

------------------------------------------------------------------------

# 32. Provider Availability

Implement health checks.

``` text
ACTIVE
DEGRADED
OFFLINE
```

If a new API key fails verification:

``` text
New connection failed.
Existing connection remains active.
```

If the provider is temporarily unavailable:

-   Keep cached non-sensitive dashboard data where appropriate.
-   Show provider status.
-   Retry asynchronous operations.
-   Do not corrupt billing state.

------------------------------------------------------------------------

# 33. API Design

Recommended internal API structure:

``` text
/api/auth/*
/api/organizations/*
/api/users/*
/api/roles/*
/api/agents/*
/api/knowledge-base/*
/api/phone-numbers/*
/api/calls/*
/api/campaigns/*
/api/leads/*
/api/billing/*
/api/wallet/*
/api/payments/*
/api/analytics/*
/api/webhooks/*
/api/settings/*
```

All tenant APIs must derive organization context from the authenticated
session rather than trusting a client-provided organization ID.

------------------------------------------------------------------------

# 34. OmniDimension API Mapping

The integration layer should cover the current OmniDimension API groups:

## Agents

``` text
GET    /agents
POST   /agents/create
GET    /agents/{agent_id}
PUT    /agents/{agent_id}
DELETE /agents/{agent_id}
```

Version management should also be supported.

## Knowledge Base

``` text
GET  /knowledge_base/list
POST /knowledge_base/can_upload
POST /knowledge_base/create
POST /knowledge_base/attach
POST /knowledge_base/detach
POST /knowledge_base/delete
```

## Providers

``` text
GET /providers/llms
GET /providers/voices
GET /providers/stt
GET /providers/tts
GET /providers/all
GET /providers/voice/{voice_id}
```

## Phone Numbers

``` text
GET  /phone_number/list
GET  /phone_number/search
POST /phone_number/purchase
POST /phone_number/release
POST /phone_number/attach
POST /phone_number/detach
POST /phone_number/import/twilio
POST /phone_number/import/exotel
POST /phone_number/import/sip
```

## Calls

``` text
POST /calls/dispatch
GET  /calls/logs
GET  /calls/logs/{call_log_id}
```

## Bulk Calls

Support the current campaign creation, contact ingestion, campaign
control, concurrency, retry, calling-hours and live-status endpoints.

## Sessions

``` text
POST /sessions/create
```

## Simulation

Support simulation creation, execution, update and deletion.

## Reseller

Where reseller access is enabled, integrate:

``` text
GET  /reseller/organizations
POST /reseller/users/add
POST /reseller/users/access-control
POST /reseller/users/expiry
POST /reseller/concurrency
POST /reseller/credits/calculate
POST /reseller/credits/transfer
POST /reseller/credits/revert
GET  /reseller/credits/logs
GET  /reseller/kyc/status
GET  /reseller/kyc/requirements
POST /reseller/kyc/steps/{step}
```

The exact endpoint contracts must be generated from the current provider
OpenAPI specification before implementation.

------------------------------------------------------------------------

# 35. Frontend Navigation

## Main Admin

``` text
Dashboard
Organizations
Users
Agents
Phone Numbers
Campaigns
Calls
Billing
Payments
Analytics
API Connections
Audit Logs
Settings
```

## Organization Admin

``` text
Dashboard
Leads
Agents
Knowledge Base
Phone Numbers
Campaigns
Calls
Analytics
Team
Billing
Settings
```

## Employee

``` text
Dashboard
Leads
Assigned Calls
Campaigns
Call History
Agents
```

Only permitted modules should be visible.

------------------------------------------------------------------------

# 36. White-Label System

Support:

``` text
Brand Name
Logo
Favicon
Primary Domain
Support Email
Support Phone
Custom Colors
Login Page
Email Branding
```

Future:

-   Custom domain
-   Custom email domain
-   White-label mobile application

------------------------------------------------------------------------

# 37. Organization Lifecycle

Use soft lifecycle states:

``` text
ACTIVE
SUSPENDED
BIN
REMOVED
```

Do not permanently delete an organization immediately.

Recommended:

``` text
Delete request
     |
BIN
     |
Retention period
     |
Permanent deletion
```

Permanent deletion must require explicit privileged authorization.

------------------------------------------------------------------------

# 38. Caching Strategy

Cache:

-   Provider lists
-   Voice lists
-   STT/TTS providers
-   Static configuration
-   Non-sensitive analytics where appropriate

Do not cache:

-   API keys
-   Sensitive payment credentials
-   Private recordings without a clear security design

------------------------------------------------------------------------

# 39. Background Jobs

Use a job queue for:

-   Bulk contact imports
-   Campaign synchronization
-   Webhook processing
-   Analytics aggregation
-   Billing reconciliation
-   Payment reconciliation
-   Email notifications
-   Provider retries

Recommended:

-   Redis + BullMQ

------------------------------------------------------------------------

# 40. Testing

## Unit Tests

Test:

-   Billing calculations
-   Permission checks
-   Tenant isolation
-   API clients
-   Data validation

## Integration Tests

Test:

-   OmniDimension API
-   Razorpay
-   Webhooks
-   Authentication
-   Database

## End-to-End Tests

Critical flows:

``` text
Login
Create organization
Create user
Create agent
Attach number
Create campaign
Add lead
Start campaign
Receive call result
View call log
Play recording
View transcript
Calculate billing
Top up wallet
```

------------------------------------------------------------------------

# 41. Deployment

## Production

``` text
Frontend
   |
Vercel

Backend
   |
Render / AWS

Database
   |
Supabase PostgreSQL

Redis
   |
Managed Redis

Payments
   |
Razorpay

Voice Provider
   |
OmniDimension
```

Use separate environments:

``` text
development
staging
production
```

------------------------------------------------------------------------

# 42. Monitoring

Monitor:

-   API latency
-   Error rate
-   Provider availability
-   Failed calls
-   Webhook failures
-   Payment failures
-   Queue failures
-   Database performance
-   Wallet reconciliation
-   Authentication anomalies

Recommended tools can include:

-   Sentry
-   structured logging
-   uptime monitoring
-   database monitoring

------------------------------------------------------------------------

# 43. Development Phases

## Phase 1 --- Foundation

Duration: 2--3 days

Build:

-   Repository
-   Architecture
-   Database
-   Authentication
-   Environment configuration
-   Base UI
-   API structure

## Phase 2 --- Multi-Tenancy

Duration: 3--4 days

Build:

-   Organizations
-   Users
-   Roles
-   Permissions
-   Tenant isolation
-   Main Admin

## Phase 3 --- Voice Engine

Duration: 4--5 days

Build:

-   OmniDimension provider
-   API key management
-   Agents
-   Providers
-   Knowledge Base
-   Phone numbers

## Phase 4 --- Calling

Duration: 3--4 days

Build:

-   Outbound calls
-   Call logs
-   Recordings
-   Transcripts
-   Call details

## Phase 5 --- Campaigns

Duration: 4--5 days

Build:

-   Campaigns
-   Contacts
-   Dynamic variables
-   Concurrency
-   Calling hours
-   Retry
-   Live status

## Phase 6 --- CRM / Leads

Duration: 3--4 days

Build:

-   Leads
-   Lead sources
-   Lead statuses
-   Instant calling
-   Campaign mapping

## Phase 7 --- Billing

Duration: 4--5 days

Build:

-   Plans
-   Wallet
-   Credits
-   Usage
-   Per-minute billing
-   Razorpay
-   Transactions

## Phase 8 --- Production Hardening

Duration: 4--6 days

Build:

-   Security
-   Audit logs
-   Error handling
-   Webhooks
-   Monitoring
-   Testing
-   Deployment

------------------------------------------------------------------------

# 44. Estimated Development Timeline

## MVP

``` text
15–20 working days
```

Includes:

-   Login
-   Main Admin
-   Organizations
-   Basic roles
-   Agents
-   Phone numbers
-   Calls
-   Basic campaigns
-   Basic call logs
-   Basic wallet

## Production V1

``` text
30–45 working days
```

Includes:

-   Complete multi-tenancy
-   RBAC
-   Agent management
-   Knowledge Base
-   Phone numbers
-   Calling
-   Campaigns
-   Leads
-   Recordings
-   Transcripts
-   Billing
-   Wallet
-   Razorpay
-   Webhooks
-   Audit logs
-   Security
-   Testing
-   Deployment

## Advanced SaaS

``` text
45–60+ working days
```

Additional:

-   Advanced analytics
-   Advanced CRM
-   White-label domains
-   Automation engine
-   Multiple providers
-   Advanced reporting
-   Notifications
-   AI summaries
-   Advanced billing reconciliation
-   Enterprise controls

------------------------------------------------------------------------

# 45. MVP Acceptance Criteria

The MVP is considered functional when an administrator can:

1.  Log in.
2.  Create an organization.
3.  Create an organization admin.
4.  Configure the provider connection.
5.  Create an AI agent.
6.  Attach a phone number.
7.  Make an outbound call.
8.  View the call result.
9.  View recording/transcript where provided.
10. Create a campaign.
11. Add contacts.
12. Start a campaign.
13. View campaign status.
14. View usage.
15. Add wallet credits.
16. Deduct call usage.
17. Prevent unauthorized tenant access.

------------------------------------------------------------------------

# 46. Production Acceptance Criteria

Production V1 must additionally satisfy:

-   Strict tenant isolation
-   Role-based permissions
-   Secure API-key encryption
-   Provider connection failover behavior
-   Webhook idempotency
-   Payment verification
-   Immutable financial transactions
-   Audit logging
-   Error monitoring
-   Rate limiting
-   Automated tests
-   Staging environment
-   Production deployment
-   Backup and recovery procedures

------------------------------------------------------------------------

# 47. Important Architecture Principle

Do not duplicate the entire voice provider.

VoiceNuvo should own:

``` text
Users
Organizations
Permissions
Branding
Billing
Wallet
CRM configuration
Lead management
Application settings
Provider credentials
```

The voice provider should remain responsible for:

``` text
Voice infrastructure
Telephony
AI calling
Agent runtime
Call execution
Provider recordings
Provider transcripts
Provider campaign execution
```

This separation significantly reduces development complexity.

------------------------------------------------------------------------

# 48. Future Provider Abstraction

VoiceNuvo should be designed so that OmniDimension is not the only
possible provider.

Future providers could be added through:

``` text
VoiceProvider
   |
   +-- OmniDimension
   +-- Provider B
   +-- Provider C
```

The UI and billing system should not need to change when a new voice
provider is added.

------------------------------------------------------------------------

# 49. Final Build Target

The final product should behave as:

``` text
                    VOICENUVO
                         |
          +--------------+--------------+
          |                             |
     SaaS Control Plane           Voice Engine
          |                             |
   Organizations                  AI Agents
   Users                          Telephony
   Permissions                    Calls
   Billing                        Recordings
   Wallet                         Transcripts
   CRM                            Campaigns
   Branding
   Analytics
```

The user should interact primarily with **VoiceNuvo**, while the
provider integration remains an implementation detail.

------------------------------------------------------------------------

# 50. Build Priority

Recommended implementation order:

``` text
1. Authentication
2. Multi-tenancy
3. Roles & permissions
4. Database
5. Provider connection
6. Agents
7. Phone numbers
8. Calls
9. Call logs
10. Campaigns
11. Leads
12. Wallet
13. Billing
14. Payments
15. Webhooks
16. Analytics
17. Audit logs
18. White-label
19. Security hardening
20. Production deployment
```

**Target:** Build a functional MVP first, then harden it into Production
V1 rather than attempting every advanced feature simultaneously.













# ADDITIONAL REQUIREMENT — OFFICIAL OMNIDIMENSION SDK

Before implementing the VoiceNuvo backend architecture, inspect the official OmniDimension developer resources:

- OmniDimension SDK documentation:
  https://docs.omnidim.io/docs/sdks

- OmniDimension GitHub organization:
  https://github.com/orgs/Omnidim/repositories

- Official OmniDimension Python SDK:
  https://github.com/Omnidim/omnidim-python-sdk

## 1. USE OFFICIAL SDK WHEN APPROPRIATE

Do not manually recreate functionality that is already provided by the official OmniDimension SDK.

The official documentation currently provides:

- Python server SDK
- TypeScript server SDK
- Web SDK
- Web widget
- Raw web-call protocol

For the VoiceNuvo backend, prefer the **official TypeScript server SDK** if the existing VoiceNuvo project is TypeScript/Node.js.

If the current architecture requires Python for a specific backend service, evaluate the official Python SDK instead.

Do NOT introduce Python only for the sake of using the SDK if the existing application is already correctly structured around TypeScript.

---

# 2. FIRST INSPECT THE SDK

Before writing the OmniDimension integration layer:

1. Inspect the official SDK documentation.
2. Inspect the official GitHub repository/repositories.
3. Identify:
   - available methods
   - authentication mechanism
   - supported API operations
   - request/response types
   - error handling
   - pagination
   - campaign support
   - agent support
   - call support
   - knowledge-base support
   - phone-number support
4. Compare SDK capabilities against the current OmniDimension REST API documentation.

Do not assume an SDK method exists.

Verify it from the official SDK source/documentation before using it.

---

# 3. PROVIDER ABSTRACTION

Even though VoiceNuvo will initially use OmniDimension, do not spread OmniDimension SDK calls throughout the application.

Create a provider/service layer.

Recommended architecture:

```text
VoiceNuvo Application
        |
        v
Voice Provider Interface
        |
        v
OmniDimension Provider
        |
        v
Official OmniDimension TypeScript SDK
        |
        v
OmniDimension API
```

For example:

```typescript
interface VoiceProvider {
  listAgents(): Promise<unknown>;
  createAgent(data: unknown): Promise<unknown>;
  getAgent(id: string): Promise<unknown>;
  updateAgent(id: string, data: unknown): Promise<unknown>;
  deleteAgent(id: string): Promise<unknown>;

  listPhoneNumbers(): Promise<unknown>;

  dispatchCall(data: unknown): Promise<unknown>;

  getCallLogs(params?: unknown): Promise<unknown>;

  createCampaign(data: unknown): Promise<unknown>;
  addCampaignContact(
    campaignId: string,
    data: unknown
  ): Promise<unknown>;
}
```

Adapt the interface to the actual SDK capabilities.

Do not use `unknown` permanently if proper SDK types are available.

Use the SDK's actual TypeScript types wherever possible.

---

# 4. OMNIDIMENSION CLIENT

Create a centralized OmniDimension client.

Example architecture:

```text
src/
└── services/
    └── providers/
        └── omnidimension/
            ├── client.ts
            ├── agents.ts
            ├── calls.ts
            ├── campaigns.ts
            ├── phone-numbers.ts
            ├── knowledge-base.ts
            └── index.ts
```

The exact structure may be changed if the existing project has a better architecture.

The important requirement is:

**Only the provider layer should know that OmniDimension is being used.**

---

# 5. API KEY SECURITY

OmniDimension secret API keys must NEVER be exposed to:

- browser JavaScript
- React components
- client-side API requests
- local storage
- cookies accessible to JavaScript
- Git
- public repositories

The SDK must only run on the server.

Use environment variables during Phase 1.

Example:

```env
OMNIDIMENSION_API_KEY=
```

Do not commit the real key.

Create:

```text
.env.example
```

with an empty placeholder.

---

# 6. DO NOT BUILD OMNIDIMENSION FEATURES YET

Phase 1 should NOT implement:

- Agent CRUD UI
- Call dispatch UI
- Campaign UI
- Phone-number UI
- Knowledge-base UI
- Call logs
- Recordings
- Transcripts
- OmniDimension billing

However, the architecture must be ready for those features.

Create only the minimum provider abstraction and configuration required for future phases.

---

# 7. PROVIDER CONNECTION MODEL

Prepare the database architecture for organization-specific provider connections.

Future table:

```text
api_connections
```

Recommended fields:

```text
id
organization_id
provider
encrypted_api_key
status
last_verified_at
last_error
created_at
updated_at
```

For Phase 1, you may create the schema but do not need to implement the complete connection-management UI.

---

# 8. IMPORTANT MULTI-TENANT REQUIREMENT

Eventually different VoiceNuvo organizations may have different OmniDimension API credentials.

Therefore DO NOT architect the application around one permanent global API key.

The final architecture should support:

```text
VoiceNuvo
    |
    +-- Organization A
    |       |
    |       +-- OmniDimension API Key A
    |
    +-- Organization B
    |       |
    |       +-- OmniDimension API Key B
    |
    +-- Organization C
            |
            +-- OmniDimension API Key C
```

The provider client should therefore eventually be capable of receiving the appropriate organization's provider connection.

---

# 9. CONNECTION VERIFICATION

Future provider connection flow:

```text
Admin enters API key
        |
        v
VoiceNuvo server
        |
        v
OmniDimension SDK
        |
        v
Test API request
        |
     SUCCESS?
      /     \
    YES      NO
     |        |
 Activate    Reject
 connection
```

Never replace a working API connection with an unverified key.

---

# 10. SDK VS RAW REST API

Use this decision process:

### Use the official SDK when:

- the required operation is supported
- the SDK exposes proper TypeScript types
- the SDK provides stable error handling
- the SDK matches the current API

### Use direct REST API when:

- the SDK does not expose a required endpoint
- the endpoint is newly released
- the SDK is missing required functionality
- the API documentation provides functionality unavailable in the SDK

If direct REST is required, isolate it inside the OmniDimension provider layer.

Do NOT mix raw REST calls throughout the application.

---

# 11. SDK VERSIONING

Pin the OmniDimension SDK to a known compatible version.

Do not automatically use an unbounded version such as:

```text
latest
```

Record the installed SDK version in the project documentation.

When upgrading the SDK:

1. Review release changes.
2. Run integration tests.
3. Verify API compatibility.
4. Verify authentication.
5. Verify critical provider operations.

---

# 12. DOCUMENTATION

Create:

```text
docs/integrations/omnidimension.md
```

Document:

- SDK package
- SDK version
- Authentication
- Environment variables
- Provider architecture
- Implemented SDK operations
- REST fallback operations
- Error handling
- How to update the SDK

---

# 13. PHASE 1 COMPLETION REQUIREMENT

At the end of Phase 1, the OmniDimension integration does NOT need to have full functionality.

It only needs:

```text
Official SDK inspected
        +
Provider architecture created
        +
Secure configuration prepared
        +
Future multi-tenant API-key model prepared
```

Do not consume additional development time implementing Phase 2 functionality.

---

# 14. IMPORTANT

The goal is NOT to clone OmniDimension's internal backend.

The goal is to build:

```text
VoiceNuvo SaaS Control Plane
+
VoiceNuvo Frontend
+
OmniDimension Integration Layer
```

OmniDimension remains the underlying voice infrastructure unless a future architecture decision changes this.

Build VoiceNuvo so that the user interacts with VoiceNuvo rather than directly interacting with the OmniDimension dashboard.