import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabaseForTests } from '@/lib/db';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { getDatabaseDriver, ensureDatabaseReady } from '@/lib/db/client';
import { OrgContext } from '@/types';
import { ROLE_PERMISSIONS } from '@/lib/permissions/permissions';

describe('Mandatory Persistence Verification Across Restarts', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  it('persists data to disk and recovers completely after closing and reinitializing database driver', async () => {
    // 1. Set up context as Main Admin
    const mainAdminCtx: OrgContext = {
      userId: 'd0000000-0000-0000-0000-000000000001',
      organizationId: 'c0000000-0000-0000-0000-000000000001',
      role: 'MAIN_ADMIN',
      permissions: ROLE_PERMISSIONS['MAIN_ADMIN'],
      user: {
        id: 'd0000000-0000-0000-0000-000000000001',
        email: 'admin@voicenuvo.com',
        name: 'Main Admin',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      organization: {
        id: 'c0000000-0000-0000-0000-000000000001',
        name: 'VoiceNuvo Platform',
        slug: 'voicenuvo-platform',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    // 2. Create persistent organization and user
    const newOrg = await organizationService.create(
      {
        name: 'Persistent Corp Inc',
        slug: 'persistent-corp-inc',
        brand_name: 'Persistent Voice',
      },
      mainAdminCtx
    );

    const newUser = await userService.create(
      {
        email: 'founder@persistentcorp.com',
        name: 'Sarah Connor',
        role: 'ORG_ADMIN',
        organization_id: newOrg.id,
        password: 'PersistentPassword123!',
      },
      mainAdminCtx
    );

    expect(newOrg.id).toBeDefined();
    expect(newUser.id).toBeDefined();

    // 3. Verify they exist before restart
    const orgBefore = await db.organizations.findById(newOrg.id);
    const userBefore = await db.users.findByEmail('founder@persistentcorp.com');
    expect(orgBefore?.name).toBe('Persistent Corp Inc');
    expect(userBefore?.name).toBe('Sarah Connor');

    // 4. Simulate process restart:
    // Close existing driver and clear global singleton instances
    const activeDriver = getDatabaseDriver();
    await activeDriver.close();
    globalThis.__voicenuvo_db_instance = undefined;
    globalThis.__voicenuvo_db_ready = undefined;

    // Small delay to allow Windows file locks on ./data/voicenuvo_pg to release
    await new Promise((resolve) => setTimeout(resolve, 250));

    // 5. Reinitialize driver from disk (simulates fresh process startup)
    const freshDriver = await ensureDatabaseReady();
    expect(freshDriver).toBeDefined();

    // 6. Query from the fresh driver instance
    const orgAfter = await db.organizations.findById(newOrg.id);
    const userAfter = await db.users.findByEmail('founder@persistentcorp.com');
    const membersAfter = await db.organizationMembers.listByOrg(newOrg.id);

    // 7. Assert complete persistence
    expect(orgAfter).not.toBeNull();
    expect(orgAfter?.id).toBe(newOrg.id);
    expect(orgAfter?.name).toBe('Persistent Corp Inc');
    expect(orgAfter?.slug).toBe('persistent-corp-inc');

    expect(userAfter).not.toBeNull();
    expect(userAfter?.email).toBe('founder@persistentcorp.com');
    expect(userAfter?.name).toBe('Sarah Connor');
    expect(userAfter?.status).toBe('ACTIVE');

    expect(membersAfter.length).toBeGreaterThanOrEqual(1);
    const membership = membersAfter.find((m) => m.user_id === userAfter?.id);
    expect(membership).toBeDefined();
    expect(membership?.role).toBe('ORG_ADMIN');
  });
});
