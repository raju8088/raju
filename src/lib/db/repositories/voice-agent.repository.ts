import { ensureDatabaseReady, QueryClient } from '../client';

export interface VoiceAgentRecord {
  id: string;
  organization_id: string;
  provider: 'OMNIDIMENSION';
  provider_agent_id: string;
  name: string;
  status: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateVoiceAgentInput {
  organizationId: string;
  provider?: 'OMNIDIMENSION';
  providerAgentId: string;
  name: string;
  status?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export class VoiceAgentRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<VoiceAgentRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<VoiceAgentRecord>(
      `SELECT * FROM voice_agents WHERE organization_id = $1 ORDER BY created_at DESC;`,
      [organizationId]
    );
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<VoiceAgentRecord | null> {
    const db = client || (await ensureDatabaseReady());
    if (organizationId) {
      return db.queryOne<VoiceAgentRecord>(
        `SELECT * FROM voice_agents WHERE id = $1 AND organization_id = $2;`,
        [id, organizationId]
      );
    }
    return db.queryOne<VoiceAgentRecord>(
      `SELECT * FROM voice_agents WHERE id = $1;`,
      [id]
    );
  }

  async findByProviderAgentId(
    organizationId: string,
    providerAgentId: string,
    client?: QueryClient
  ): Promise<VoiceAgentRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<VoiceAgentRecord>(
      `SELECT * FROM voice_agents WHERE organization_id = $1 AND provider_agent_id = $2;`,
      [organizationId, providerAgentId]
    );
  }

  async create(
    input: CreateVoiceAgentInput,
    client?: QueryClient
  ): Promise<VoiceAgentRecord> {
    const db = client || (await ensureDatabaseReady());
    const row = await db.queryOne<VoiceAgentRecord>(
      `INSERT INTO voice_agents (
        organization_id, provider, provider_agent_id, name,
        status, is_active, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;`,
      [
        input.organizationId,
        input.provider || 'OMNIDIMENSION',
        input.providerAgentId,
        input.name,
        input.status || 'ACTIVE',
        input.isActive ?? true,
        JSON.stringify(input.metadata || {}),
      ]
    );

    if (!row) {
      throw new Error('Failed to create voice agent record');
    }
    return row;
  }

  async upsert(
    input: CreateVoiceAgentInput,
    client?: QueryClient
  ): Promise<VoiceAgentRecord> {
    const db = client || (await ensureDatabaseReady());
    const row = await db.queryOne<VoiceAgentRecord>(
      `INSERT INTO voice_agents (
        organization_id, provider, provider_agent_id, name,
        status, is_active, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (organization_id, provider, provider_agent_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *;`,
      [
        input.organizationId,
        input.provider || 'OMNIDIMENSION',
        input.providerAgentId,
        input.name,
        input.status || 'ACTIVE',
        input.isActive ?? true,
        JSON.stringify(input.metadata || {}),
      ]
    );

    if (!row) {
      throw new Error('Failed to upsert voice agent record');
    }
    return row;
  }

  async markStaleAgents(
    organizationId: string,
    activeProviderAgentIds: string[],
    provider: 'OMNIDIMENSION' = 'OMNIDIMENSION',
    client?: QueryClient
  ): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    if (activeProviderAgentIds.length === 0) {
      const res = await db.query(
        `UPDATE voice_agents
         SET status = 'INACTIVE', is_active = false, updated_at = NOW()
         WHERE organization_id = $1 AND provider = $2 AND is_active = true
         RETURNING id;`,
        [organizationId, provider]
      );
      return res.length;
    }

    const res = await db.query(
      `UPDATE voice_agents
       SET status = 'INACTIVE', is_active = false, updated_at = NOW()
       WHERE organization_id = $1
         AND provider = $2
         AND is_active = true
         AND NOT (provider_agent_id = ANY($3::text[]))
       RETURNING id;`,
      [organizationId, provider, activeProviderAgentIds]
    );
    return res.length;
  }

  async update(
    id: string,
    organizationId: string,
    updates: { name?: string; status?: string; is_active?: boolean; metadata?: Record<string, unknown> },
    client?: QueryClient
  ): Promise<VoiceAgentRecord | null> {
    const db = client || (await ensureDatabaseReady());
    const existing = await this.findById(id, organizationId, db);
    if (!existing) return null;

    const newName = updates.name !== undefined ? updates.name : existing.name;
    const newStatus = updates.status !== undefined ? updates.status : existing.status;
    const newIsActive = updates.is_active !== undefined ? updates.is_active : existing.is_active;
    const newMeta = updates.metadata !== undefined
      ? JSON.stringify({ ...existing.metadata, ...updates.metadata })
      : JSON.stringify(existing.metadata);

    return db.queryOne<VoiceAgentRecord>(
      `UPDATE voice_agents SET
        name = $1,
        status = $2,
        is_active = $3,
        metadata = $4,
        updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *;`,
      [newName, newStatus, newIsActive, newMeta, id, organizationId]
    );
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM voice_agents WHERE id = $1 AND organization_id = $2 RETURNING id;`,
      [id, organizationId]
    );
    return res.length > 0;
  }
}

export const voiceAgentRepository = new VoiceAgentRepository();
