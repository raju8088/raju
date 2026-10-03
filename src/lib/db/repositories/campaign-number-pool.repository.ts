import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';

export interface CampaignNumberPoolRecord {
  id: string;
  organization_id: string;
  campaign_id: string;
  phone_number_id: string;
  provider_number_id: string;
  provider_assignment_id: string | null;
  phone_number: string;
  is_active: boolean;
  sequence: number;
  health_score: number | null;
  calls_count: number;
  created_at: string;
  updated_at: string;
}

export interface AddNumberToPoolInput {
  organizationId: string;
  campaignId: string;
  phoneNumberId: string;
  providerNumberId: string;
  providerAssignmentId?: string | null;
  phoneNumber: string;
  isActive?: boolean;
  sequence?: number;
}

export class CampaignNumberPoolRepository {
  async addNumber(
    input: AddNumberToPoolInput,
    client?: QueryClient
  ): Promise<CampaignNumberPoolRecord> {
    const db = client || (await ensureDatabaseReady());
    const id = generateUUID();
    const isActive = input.isActive !== false;
    const sequence = input.sequence ?? 10;

    const row = await db.queryOne<CampaignNumberPoolRecord>(
      `INSERT INTO campaign_number_pool (
        id, organization_id, campaign_id, phone_number_id,
        provider_number_id, provider_assignment_id, phone_number,
        is_active, sequence, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (campaign_id, phone_number_id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        sequence = EXCLUDED.sequence,
        updated_at = NOW()
      RETURNING *;`,
      [
        id,
        input.organizationId,
        input.campaignId,
        input.phoneNumberId,
        input.providerNumberId,
        input.providerAssignmentId || null,
        input.phoneNumber,
        isActive,
        sequence,
      ]
    );

    if (!row) {
      throw new Error('Failed to add number to rotation pool');
    }
    return row;
  }

  async findByCampaignId(
    campaignId: string,
    organizationId: string,
    client?: QueryClient
  ): Promise<CampaignNumberPoolRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<CampaignNumberPoolRecord>(
      `SELECT * FROM campaign_number_pool
       WHERE campaign_id = $1 AND organization_id = $2
       ORDER BY sequence ASC, created_at ASC;`,
      [campaignId, organizationId]
    );
  }

  async setNumberActive(
    campaignId: string,
    organizationId: string,
    phoneNumberId: string,
    isActive: boolean,
    client?: QueryClient
  ): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `UPDATE campaign_number_pool
       SET is_active = $1, updated_at = NOW()
       WHERE campaign_id = $2 AND organization_id = $3 AND (phone_number_id = $4 OR id = $4);`,
      [isActive, campaignId, organizationId, phoneNumberId]
    );
    return res !== null;
  }

  async deleteNumber(
    campaignId: string,
    organizationId: string,
    phoneNumberId: string,
    client?: QueryClient
  ): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM campaign_number_pool
       WHERE campaign_id = $1 AND organization_id = $2 AND (phone_number_id = $3 OR id = $3);`,
      [campaignId, organizationId, phoneNumberId]
    );
    return res !== null;
  }
}

export const campaignNumberPoolRepository = new CampaignNumberPoolRepository();
