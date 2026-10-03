export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'BIN' | 'REMOVED';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BIN' | 'REMOVED';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export type RoleType = 'MAIN_ADMIN' | 'ORG_ADMIN' | 'EMPLOYEE';

export type PermissionKey =
  | 'ORGANIZATION_VIEW'
  | 'ORGANIZATION_CREATE'
  | 'ORGANIZATION_UPDATE'
  | 'ORGANIZATION_SUSPEND'
  | 'USER_VIEW'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'DASHBOARD_VIEW'
  | 'VOICE_PROVIDER_MANAGE'
  | 'AGENT_VIEW'
  | 'AGENT_MANAGE'
  | 'KNOWLEDGE_BASE_VIEW'
  | 'KNOWLEDGE_BASE_MANAGE'
  | 'PHONE_NUMBER_VIEW'
  | 'PHONE_NUMBER_MANAGE'
  | 'CALL_VIEW'
  | 'CALL_DISPATCH'
  | 'CALL_MANAGE'
  | 'CAMPAIGN_VIEW'
  | 'CAMPAIGN_CREATE'
  | 'CAMPAIGN_MANAGE'
  | 'CAMPAIGN_DISPATCH'
  | 'CAMPAIGN_RETRY'
  | 'CAMPAIGN_EXPORT'
  | 'LEAD_VIEW'
  | 'LEAD_CREATE'
  | 'LEAD_MANAGE'
  | 'LEAD_ASSIGN'
  | 'LEAD_IMPORT'
  | 'LEAD_EXPORT'
  | 'LEAD_DELETE'
  | 'CONTACT_VIEW'
  | 'CONTACT_MANAGE'
  | 'INTEGRATION_MANAGE'
  | 'BILLING_VIEW'
  | 'BILLING_MANAGE'
  | 'BILLING_PAY'
  | 'BILLING_EXPORT'
  | 'PLAN_VIEW'
  | 'PLAN_MANAGE'
  | 'USAGE_VIEW';

export * from './crm';
export * from './billing';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  brand_name?: string | null;
  status: OrganizationStatus;
  plan_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  auth_provider_id?: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  password_hash?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: RoleType;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
  user?: User;
  organization?: Organization;
}

export interface Role {
  id: string;
  organization_id?: string | null;
  name: RoleType;
  description?: string | null;
  created_at?: string;
}

export interface Permission {
  id: string;
  key: PermissionKey;
  description?: string | null;
  created_at?: string;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: RoleType;
  permissions: PermissionKey[];
  user: User;
  organization: Organization;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface SessionPayload {
  userId: string;
  currentOrgId: string;
  role: RoleType;
  expiresAt: number;
}
