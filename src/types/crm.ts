export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'NURTURE'
  | 'CONVERTED'
  | 'LOST'
  | 'DISQUALIFIED';

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFICATION'
  | 'FOLLOW_UP'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type LeadSourceType =
  | 'META_LEAD_AD'
  | 'WEBSITE'
  | 'MANUAL'
  | 'CSV'
  | 'API'
  | 'CAMPAIGN'
  | 'OTHER';

export type FollowUpStatus = 'NONE' | 'PENDING' | 'COMPLETED' | 'CANCELED';

export type LeadActivityType =
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'STATUS_CHANGED'
  | 'STAGE_CHANGED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'CALL_DISPATCHED'
  | 'CALL_COMPLETED'
  | 'CALL_FAILED'
  | 'CAMPAIGN_ATTEMPT'
  | 'NOTE_ADDED'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_COMPLETED'
  | 'SOURCE_UPDATED';

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';

export type MetaConnectionStatus = 'ACTIVE' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';

export type ExternalLeadEventStatus =
  | 'RECEIVED'
  | 'PROCESSED'
  | 'RETRY_PENDING'
  | 'FAILED'
  | 'DUPLICATE';

export interface Contact {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  last_activity_at: string | null;
}

export interface LeadSource {
  id: string;
  organization_id: string;
  name: string;
  type: LeadSourceType;
  platform: string | null;
  external_source_id: string | null;
  is_active: boolean;
  config: {
    auto_call_enabled?: boolean;
    auto_call_agent_id?: string;
    auto_call_phone_number_id?: string;
    webhook_secret?: string;
    api_key?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  contact_id: string;
  title: string | null;
  status: LeadStatus;
  stage: LeadStage;
  source_id: string | null;
  source_type: LeadSourceType;
  source_name: string | null;
  external_id: string | null;
  external_platform: string | null;
  external_form_id: string | null;
  external_ad_id: string | null;
  external_campaign_id: string | null;
  assigned_user_id: string | null;
  assigned_agent_id: string | null;
  priority: LeadPriority;
  score: number;
  qualification_status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  raw_attribution: Record<string, unknown>;
  custom_fields: Record<string, unknown>;
  tags: string[];
  next_follow_up_at: string | null;
  follow_up_status: FollowUpStatus;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  converted_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Joined relation fields for convenience
  contact?: Contact;
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  assigned_agent?: {
    id: string;
    name: string;
  } | null;
  source?: LeadSource | null;
}

export interface LeadActivity {
  id: string;
  organization_id: string;
  lead_id: string;
  activity_type: LeadActivityType;
  actor_id: string | null;
  actor_name?: string | null;
  reference_id: string | null;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface LeadNote {
  id: string;
  organization_id: string;
  lead_id: string;
  author_id: string | null;
  author_name?: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface LeadAssignment {
  id: string;
  organization_id: string;
  lead_id: string;
  previous_user_id: string | null;
  new_user_id: string | null;
  previous_agent_id: string | null;
  new_agent_id: string | null;
  actor_id: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface LeadFieldDefinition {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalLeadEvent {
  id: string;
  organization_id: string;
  provider: string;
  provider_event_id: string;
  external_lead_id: string | null;
  event_hash: string | null;
  processing_status: ExternalLeadEventStatus;
  lead_id: string | null;
  error_message_safe: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface MetaIntegration {
  id: string;
  organization_id: string;
  platform: 'META';
  page_id: string | null;
  page_name: string | null;
  business_id: string | null;
  ad_account_id: string | null;
  encrypted_access_token: string;
  token_metadata: {
    scopes?: string[];
    expires_at?: string | null;
    app_id?: string | null;
    [key: string]: unknown;
  };
  webhook_verify_token: string | null;
  app_secret_proof_enabled: boolean;
  connection_status: MetaConnectionStatus;
  auto_call_enabled: boolean;
  auto_call_agent_id: string | null;
  auto_call_phone_number_id: string | null;
  connected_at: string;
  last_verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadKPIs {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  todayNewLeads: number;
  todayCalls: number;
  pendingFollowUps: number;
  conversionRate: number;
}
