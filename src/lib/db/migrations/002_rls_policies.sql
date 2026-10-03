-- 002_rls_policies.sql
-- VoiceNuvo Phase 1 Row Level Security (RLS) & Multi-Tenant Isolation

-- Ensure auth schema and auth.uid() helper exist (for Supabase / Postgres compatibility)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS on all multi-tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Helper function: Get organization IDs where current auth user is an active member
-- SECURITY DEFINER allows this function to bypass RLS internally and prevents infinite policy recursion
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS TABLE (org_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT om.organization_id
    FROM organization_members om
    WHERE om.user_id = auth.uid()
      AND om.status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get user membership roles
CREATE OR REPLACE FUNCTION get_user_org_membership(target_org_id UUID)
RETURNS TABLE (role VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT om.role
    FROM organization_members om
    WHERE om.organization_id = target_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if current auth user is MAIN_ADMIN
CREATE OR REPLACE FUNCTION is_main_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.role = 'MAIN_ADMIN'
          AND om.status = 'ACTIVE'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Organizations Policies
-- MAIN_ADMIN can view all organizations; Members can only view their own organizations
CREATE POLICY org_select_policy ON organizations
    FOR SELECT
    USING (
        is_main_admin() OR
        id IN (SELECT get_my_org_ids())
    );

-- Only MAIN_ADMIN can create organizations in Phase 1
CREATE POLICY org_insert_policy ON organizations
    FOR INSERT
    WITH CHECK (
        is_main_admin()
    );

-- MAIN_ADMIN or ORG_ADMIN can update their own organization
CREATE POLICY org_update_policy ON organizations
    FOR UPDATE
    USING (
        is_main_admin() OR
        id IN (SELECT get_my_org_ids())
    );

-- 2. Organization Members Policies
-- Users can see members of organizations they are active in; MAIN_ADMIN sees all
CREATE POLICY member_select_policy ON organization_members
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

-- MAIN_ADMIN or ORG_ADMIN can invite/create members in their own organization
CREATE POLICY member_insert_policy ON organization_members
    FOR INSERT
    WITH CHECK (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

-- MAIN_ADMIN or ORG_ADMIN can update members in their organization
CREATE POLICY member_update_policy ON organization_members
    FOR UPDATE
    USING (
        is_main_admin() OR
        organization_id IN (SELECT get_my_org_ids())
    );

-- 3. Users Policies
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
        is_main_admin() OR
        id = auth.uid() OR
        id IN (
            SELECT om.user_id
            FROM organization_members om
            WHERE om.organization_id IN (SELECT get_my_org_ids())
              AND om.status = 'ACTIVE'
        )
    );

CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (
        is_main_admin() OR id = auth.uid()
    );

-- 4. Permissions & Roles Policies (Read-only for authenticated users)
CREATE POLICY roles_select_policy ON roles FOR SELECT USING (true);
CREATE POLICY permissions_select_policy ON permissions FOR SELECT USING (true);
CREATE POLICY role_permissions_select_policy ON role_permissions FOR SELECT USING (true);
