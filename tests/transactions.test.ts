import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabaseForTests } from '@/lib/db';
import { organizationRepository } from '@/lib/db/repositories/organization.repository';
import { generateUUID } from '@/lib/utils/crypto';

describe('PostgreSQL Database Constraints & ACID Transactions', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  describe('ACID Transaction Rollback', () => {
    it('rolls back all changes if a transaction step fails midway, preventing orphaned records', async () => {
      const testOrgId = generateUUID();
      const testSlug = 'rollback-test-org';

      let caughtError: unknown = null;
      try {
        await db.transaction(async (tx) => {
          // Step 1: Insert organization inside transaction
          await tx.query(
            `INSERT INTO organizations (id, name, slug, status)
             VALUES ($1, $2, $3, 'ACTIVE');`,
            [testOrgId, 'Rollback Test Org', testSlug]
          );

          // Step 2: Attempt an invalid operation that violates a foreign key or unique constraint
          // Inserting member with non-existent user_id
          await tx.query(
            `INSERT INTO organization_members (organization_id, user_id, role, status)
             VALUES ($1, $2, 'ORG_ADMIN', 'ACTIVE');`,
            [testOrgId, '00000000-0000-0000-0000-000000000099'] // User does NOT exist! Foreign key violation
          );
        });
      } catch (err) {
        caughtError = err;
      }

      // 1. Transaction must have thrown an error
      expect(caughtError).not.toBeNull();

      // 2. Organization from Step 1 must NOT exist in the database (it was rolled back)
      const rolledBackOrg = await organizationRepository.findById(testOrgId);
      expect(rolledBackOrg).toBeNull();

      const rolledBackBySlug = await organizationRepository.findBySlug(testSlug);
      expect(rolledBackBySlug).toBeNull();
    });
  });

  describe('Database Constraints Enforcement', () => {
    it('enforces unique constraints on user email', async () => {
      const email = 'unique-test@example.com';
      await db.users.create({
        email,
        name: 'User One',
        status: 'ACTIVE',
      });

      // Attempt duplicate email insertion
      await expect(
        db.users.create({
          email,
          name: 'User Two',
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('enforces unique constraints on organization slug', async () => {
      const slug = 'unique-slug-test';
      await db.organizations.create({
        name: 'Org One',
        slug,
        status: 'ACTIVE',
      });

      await expect(
        db.organizations.create({
          name: 'Org Two',
          slug,
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('enforces foreign key cascading delete when organization is deleted', async () => {
      // Create org and member
      const org = await db.organizations.create({
        name: 'Cascade Test Org',
        slug: 'cascade-test-org',
        status: 'ACTIVE',
      });

      const user = await db.users.create({
        email: 'cascade-user@example.com',
        name: 'Cascade User',
        status: 'ACTIVE',
      });

      const member = await db.organizationMembers.create({
        organization_id: org.id,
        user_id: user.id,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      });

      expect(member.id).toBeDefined();

      // Delete organization directly
      await db.query('DELETE FROM organizations WHERE id = $1;', [org.id]);

      // Organization member must be cascaded deleted by PostgreSQL ON DELETE CASCADE
      const members = await db.organizationMembers.listByOrg(org.id);
      expect(members.length).toBe(0);
    });
  });
});
