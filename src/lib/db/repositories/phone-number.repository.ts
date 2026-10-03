import { ensureDatabaseReady, QueryClient } from '../client';

export interface PhoneNumberRecord {
  id: string;
  organization_id: string;
  provider: 'OMNIDIMENSION';
  provider_phone_id: string;
  phone_number: string;
  region: string;
  status: string;
  assigned_agent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreatePhoneNumberInput {
  organizationId: string;
  provider?: 'OMNIDIMENSION';
  providerPhoneId: string;
  phoneNumber: string;
  region?: string;
  status?: string;
  assignedAgentId?: string | null;
  metadata?: Record<string, unknown>;
}

export class PhoneNumberRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<PhoneNumberRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<PhoneNumberRecord>(
      `SELECT * FROM phone_numbers WHERE organization_id = $1 ORDER BY created_at DESC;`,
      [organizationId]
    );
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<PhoneNumberRecord | null> {
    const db = client || (await ensureDatabaseReady());
    if (organizationId) {
      return db.queryOne<PhoneNumberRecord>(
        `SELECT * FROM phone_numbers WHERE id = $1 AND organization_id = $2;`,
        [id, organizationId]
      );
    }
    return db.queryOne<PhoneNumberRecord>(
      `SELECT * FROM phone_numbers WHERE id = $1;`,
      [id]
    );
  }

  async findByPhoneNumber(
    organizationId: string,
    phoneNumber: string,
    client?: QueryClient
  ): Promise<PhoneNumberRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<PhoneNumberRecord>(
      `SELECT * FROM phone_numbers WHERE organization_id = $1 AND phone_number = $2;`,
      [organizationId, phoneNumber]
    );
  }

  async create(
    input: CreatePhoneNumberInput,
    client?: QueryClient
  ): Promise<PhoneNumberRecord> {
    const db = client || (await ensureDatabaseReady());
    const row = await db.queryOne<PhoneNumberRecord>(
      `INSERT INTO phone_numbers (
        organization_id, provider, provider_phone_id, phone_number,
        region, status, assigned_agent_id, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *;`,
      [
        input.organizationId,
        input.provider || 'OMNIDIMENSION',
        input.providerPhoneId,
        input.phoneNumber,
        input.region || 'US',
        input.status || 'ACTIVE',
        input.assignedAgentId || null,
        JSON.stringify(input.metadata || {}),
      ]
    );

    if (!row) {
      throw new Error('Failed to create phone number record');
    }
    return row;
  }

  async updateAgentAssignment(
    id: string,
    organizationId: string,
    assignedAgentId: string | null,
    client?: QueryClient
  ): Promise<PhoneNumberRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<PhoneNumberRecord>(
      `UPDATE phone_numbers SET
        assigned_agent_id = $1,
        updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *;`,
      [assignedAgentId, id, organizationId]
    );
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM phone_numbers WHERE id = $1 AND organization_id = $2 RETURNING id;`,
      [id, organizationId]
    );
    return res.length > 0;
  }
}

export const phoneNumberRepository = new PhoneNumberRepository();
