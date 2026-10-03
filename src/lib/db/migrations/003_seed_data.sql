-- 003_seed_data.sql
-- VoiceNuvo Phase 1 Development Seed Data
-- Clearly marked for development & testing environments only

-- 1. Insert Base Permissions
INSERT INTO permissions (id, key, description) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'ORGANIZATION_VIEW', 'View organization details and profile'),
  ('a0000000-0000-0000-0000-000000000002', 'ORGANIZATION_CREATE', 'Create child organizations (Main Admin)'),
  ('a0000000-0000-0000-0000-000000000003', 'ORGANIZATION_UPDATE', 'Modify organization details and settings'),
  ('a0000000-0000-0000-0000-000000000004', 'ORGANIZATION_SUSPEND', 'Suspend or decommission organizations (Main Admin)'),
  ('a0000000-0000-0000-0000-000000000005', 'USER_VIEW', 'View user profiles and member list'),
  ('a0000000-0000-0000-0000-000000000006', 'USER_CREATE', 'Invite and create users in organization'),
  ('a0000000-0000-0000-0000-000000000007', 'USER_UPDATE', 'Update member roles and statuses'),
  ('a0000000-0000-0000-0000-000000000008', 'USER_DELETE', 'Remove members from organization'),
  ('a0000000-0000-0000-0000-000000000009', 'DASHBOARD_VIEW', 'Access dashboard workspace')
ON CONFLICT (key) DO NOTHING;

-- 2. Insert Standard Roles
INSERT INTO roles (id, name, description) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'MAIN_ADMIN', 'Global VoiceNuvo Super Administrator'),
  ('b0000000-0000-0000-0000-000000000002', 'ORG_ADMIN', 'Organization Level Administrator'),
  ('b0000000-0000-0000-0000-000000000003', 'EMPLOYEE', 'Organization Team Member')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Role-Permission mappings
-- MAIN_ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-0000-0000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- ORG_ADMIN permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-0000-0000-000000000002', id FROM permissions
WHERE key IN ('ORGANIZATION_VIEW', 'ORGANIZATION_UPDATE', 'USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'DASHBOARD_VIEW')
ON CONFLICT DO NOTHING;

-- EMPLOYEE permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-0000-0000-000000000003', id FROM permissions
WHERE key IN ('ORGANIZATION_VIEW', 'USER_VIEW', 'DASHBOARD_VIEW')
ON CONFLICT DO NOTHING;

-- 4. Demo Organizations
-- Platform Org (Main Admin root org)
INSERT INTO organizations (id, name, slug, brand_name, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'VoiceNuvo Platform', 'voicenuvo-platform', 'VoiceNuvo Global', 'ACTIVE'),
  ('c0000000-0000-0000-0000-000000000002', 'Acme Voice Corp', 'acme-voice', 'Acme Voice AI', 'ACTIVE'),
  ('c0000000-0000-0000-0000-000000000003', 'Globex Telephony', 'globex-telephony', 'Globex Voice Solutions', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

-- 5. Demo Users
-- Note: Password for all demo accounts in development: 'Password123!'
-- Passwords will be authenticated via verifyPassword in dev runtime
INSERT INTO users (id, email, name, phone, status) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'admin@voicenuvo.com', 'Main Admin', '+12025550100', 'ACTIVE'),
  ('d0000000-0000-0000-0000-000000000002', 'orgadmin@acme.com', 'Alice Admin (Acme)', '+12025550101', 'ACTIVE'),
  ('d0000000-0000-0000-0000-000000000003', 'employee@acme.com', 'Bob Employee (Acme)', '+12025550102', 'ACTIVE'),
  ('d0000000-0000-0000-0000-000000000004', 'admin@globex.com', 'Gary Globex (Globex)', '+12025550103', 'ACTIVE'),
  ('d0000000-0000-0000-0000-000000000005', 'worker@globex.com', 'Wendy Worker (Globex)', '+12025550104', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- 6. Memberships
INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'MAIN_ADMIN', 'ACTIVE'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'ORG_ADMIN', 'ACTIVE'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'EMPLOYEE', 'ACTIVE'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004', 'ORG_ADMIN', 'ACTIVE'),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000005', 'EMPLOYEE', 'ACTIVE')
ON CONFLICT (organization_id, user_id) DO NOTHING;
