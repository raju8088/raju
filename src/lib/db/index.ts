import {
  Organization,
  User,
  OrganizationMember,
  RoleType,
  PermissionKey,
} from '@/types';
import { ROLE_PERMISSIONS } from '../permissions/permissions';
import { ensureDatabaseReady, QueryClient, TransactionClient } from './client';
import { organizationRepository } from './repositories/organization.repository';
import { userRepository } from './repositories/user.repository';
import { auditRepository, AuditLogEntry } from './repositories/audit.repository';
import { rateLimitRepository, RateLimitResult } from './repositories/rate-limit.repository';

/**
 * Universal Production Database Access Layer
 * Backed by real persistent PostgreSQL (Supabase Pool or persistent PGlite disk storage)
 * No in-memory Map stores or fake database emulation.
 */
export const db = {
  /**
   * Execute block within an ACID PostgreSQL transaction
   */
  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const driver = await ensureDatabaseReady();
    return driver.transaction(fn);
  },

  organizations: {
    async findById(id: string, client?: QueryClient): Promise<Organization | null> {
      return organizationRepository.findById(id, client);
    },

    async findBySlug(slug: string, client?: QueryClient): Promise<Organization | null> {
      return organizationRepository.findBySlug(slug, client);
    },

    async list(client?: QueryClient): Promise<Organization[]> {
      return organizationRepository.list(client);
    },

    async create(
      data: Omit<Organization, 'id' | 'created_at' | 'updated_at'> & { id?: string },
      client?: QueryClient
    ): Promise<Organization> {
      return organizationRepository.create(data, client);
    },

    async update(id: string, data: Partial<Organization>, client?: QueryClient): Promise<Organization | null> {
      return organizationRepository.update(id, data, client);
    },

    async delete(id: string, client?: QueryClient): Promise<boolean> {
      return organizationRepository.delete(id, client);
    },
  },

  users: {
    async findById(id: string, client?: QueryClient): Promise<User | null> {
      return userRepository.findById(id, client);
    },

    async findByEmail(email: string, client?: QueryClient): Promise<User | null> {
      return userRepository.findByEmail(email, client);
    },

    async list(client?: QueryClient): Promise<User[]> {
      return userRepository.list(client);
    },

    async create(
      data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string },
      client?: QueryClient
    ): Promise<User> {
      return userRepository.create(data, client);
    },

    async update(id: string, data: Partial<User>, client?: QueryClient): Promise<User | null> {
      return userRepository.update(id, data, client);
    },

    async delete(id: string, client?: QueryClient): Promise<boolean> {
      return userRepository.delete(id, client);
    },
  },

  organizationMembers: {
    async findById(id: string, client?: QueryClient): Promise<OrganizationMember | null> {
      return userRepository.findMemberById(id, client);
    },

    async findByOrgAndUser(orgId: string, userId: string, client?: QueryClient): Promise<OrganizationMember | null> {
      return userRepository.findMemberByOrgAndUser(orgId, userId, client);
    },

    async listByOrg(orgId: string, client?: QueryClient): Promise<OrganizationMember[]> {
      return userRepository.listMembersByOrg(orgId, client);
    },

    async listByUser(userId: string, client?: QueryClient): Promise<OrganizationMember[]> {
      return userRepository.listMembersByUser(userId, client);
    },

    async create(
      data: Omit<OrganizationMember, 'id' | 'created_at' | 'updated_at' | 'user' | 'organization'> & { id?: string },
      client?: QueryClient
    ): Promise<OrganizationMember> {
      return userRepository.createMember(data, client);
    },

    async update(id: string, data: Partial<OrganizationMember>, client?: QueryClient): Promise<OrganizationMember | null> {
      return userRepository.updateMember(id, data, client);
    },

    async delete(id: string, client?: QueryClient): Promise<boolean> {
      return userRepository.deleteMember(id, client);
    },
  },

  auditLogs: {
    async record(entry: AuditLogEntry, client?: QueryClient): Promise<AuditLogEntry> {
      return auditRepository.record(entry, client);
    },

    async listByOrg(orgId: string, limit = 50, client?: QueryClient): Promise<AuditLogEntry[]> {
      return auditRepository.listByOrg(orgId, limit, client);
    },

    async listAll(limit = 100, client?: QueryClient): Promise<AuditLogEntry[]> {
      return auditRepository.listAll(limit, client);
    },
  },

  rateLimits: {
    async checkAndConsume(
      key: string,
      maxAttempts = 5,
      windowSeconds = 900,
      client?: QueryClient
    ): Promise<RateLimitResult> {
      return rateLimitRepository.checkAndConsume(key, maxAttempts, windowSeconds, client);
    },

    async reset(key: string, client?: QueryClient): Promise<void> {
      return rateLimitRepository.reset(key, client);
    },
  },

  roles: {
    getRolePermissions(role: RoleType): PermissionKey[] {
      return ROLE_PERMISSIONS[role] || [];
    },
  },

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const driver = await ensureDatabaseReady();
    return driver.query<T>(sql, params);
  },

  async withUserContext<T>(userId: string, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const driver = await ensureDatabaseReady();
    if (driver.withUserContext) {
      return driver.withUserContext(userId, fn);
    }
    return driver.transaction(async (tx) => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
      return fn(tx);
    });
  },
};

/**
 * Test Helper: Resets development database to clean seed state via real SQL transactions
 */
export async function resetDatabaseForTests(): Promise<void> {
  const driver = await ensureDatabaseReady();
  await driver.transaction(async (tx) => {
    await tx.query('DELETE FROM organization_members;');
    await tx.query('DELETE FROM organizations;');
    await tx.query('DELETE FROM users;');
    await tx.query('DELETE FROM audit_logs;');
    await tx.query('DELETE FROM rate_limits;');

    // Re-seed standard test accounts using SQL
    await tx.query(`
      INSERT INTO organizations (id, name, slug, brand_name, status, plan_id) VALUES
        ('c0000000-0000-0000-0000-000000000001', 'VoiceNuvo Platform', 'voicenuvo-platform', 'VoiceNuvo Global', 'ACTIVE', 'enterprise'),
        ('c0000000-0000-0000-0000-000000000002', 'Acme Voice Corp', 'acme-voice', 'Acme Voice AI', 'ACTIVE', 'growth'),
        ('c0000000-0000-0000-0000-000000000003', 'Globex Telephony', 'globex-telephony', 'Globex Voice Solutions', 'ACTIVE', 'starter');
    `);

    // Pre-computed scrypt hash for 'Password123!'
    const devHash =
      '7a6b5c4d3e2f1098:a6307bdf0a4e4e9b1ea41aa02934bcb37f74b7d9876e723720356c16f0604e9421f9e1cf91319689b9c8624813af6bdd70f7aceacc47ba30b726001a7ea4419e';

    await tx.query(
      `
      INSERT INTO users (id, email, name, phone, password_hash, status) VALUES
        ('d0000000-0000-0000-0000-000000000001', 'admin@voicenuvo.com', 'Main Admin', '+12025550100', $1, 'ACTIVE'),
        ('d0000000-0000-0000-0000-000000000002', 'orgadmin@acme.com', 'Alice Admin (Acme)', '+12025550101', $1, 'ACTIVE'),
        ('d0000000-0000-0000-0000-000000000003', 'employee@acme.com', 'Bob Employee (Acme)', '+12025550102', $1, 'ACTIVE'),
        ('d0000000-0000-0000-0000-000000000004', 'admin@globex.com', 'Gary Globex (Globex)', '+12025550103', $1, 'ACTIVE'),
        ('d0000000-0000-0000-0000-000000000005', 'worker@globex.com', 'Wendy Worker (Globex)', '+12025550104', $1, 'ACTIVE');
    `,
      [devHash]
    );

    await tx.query(`
      INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES
        ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'MAIN_ADMIN', 'ACTIVE'),
        ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'ORG_ADMIN', 'ACTIVE'),
        ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'EMPLOYEE', 'ACTIVE'),
        ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004', 'ORG_ADMIN', 'ACTIVE'),
        ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000005', 'EMPLOYEE', 'ACTIVE');
    `);
  });
}
