import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { UsageCharge } from '@/types/billing';

export class UsageChargeRepository {
  async create(
    input: {
      id?: string;
      organizationId: string;
      usageEventId: string;
      pricingRuleId?: string | null;
      quantity: number;
      unitPriceMinor: number;
      subtotalMinor: number;
      taxMinor?: number;
      totalMinor: number;
      currency?: string;
      status?: 'SETTLED' | 'WAIVED' | 'REFUNDED';
      walletLedgerId?: string | null;
    },
    client?: QueryClient
  ): Promise<UsageCharge> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO usage_charges (
        id, organization_id, usage_event_id, pricing_rule_id,
        quantity, unit_price_minor, subtotal_minor, tax_minor,
        total_minor, currency, status, wallet_ledger_id, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<UsageCharge>(sql, [
      id,
      input.organizationId,
      input.usageEventId,
      input.pricingRuleId || null,
      input.quantity,
      input.unitPriceMinor,
      input.subtotalMinor,
      input.taxMinor ?? 0,
      input.totalMinor,
      input.currency || 'INR',
      input.status || 'SETTLED',
      input.walletLedgerId || null,
    ]);

    if (!row) throw new Error('Failed to create usage charge');
    return row;
  }

  async findByUsageEventId(
    usageEventId: string,
    client?: QueryClient
  ): Promise<UsageCharge | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM usage_charges WHERE usage_event_id = $1 LIMIT 1;`;
    return db.queryOne<UsageCharge>(sql, [usageEventId]);
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<{ charges: UsageCharge[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const countSql = `SELECT COUNT(*) as count FROM usage_charges WHERE organization_id = $1;`;
    const listSql = `
      SELECT uc.*, ue.duration_seconds as call_duration_seconds, c.direction as call_direction, c.destination_number
      FROM usage_charges uc
      JOIN usage_events ue ON uc.usage_event_id = ue.id
      LEFT JOIN calls c ON ue.call_id = c.id
      WHERE uc.organization_id = $1
      ORDER BY uc.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const [countRes, charges] = await Promise.all([
      db.queryOne<{ count: string | number }>(countSql, [organizationId]),
      db.query<UsageCharge>(listSql, [organizationId, limit, offset]),
    ]);

    return {
      charges,
      total: Number(countRes?.count || 0),
    };
  }

  async sumUsageForMonth(
    organizationId: string,
    year: number,
    month: number,
    client?: QueryClient
  ): Promise<{ totalChargesMinor: number; totalMinutes: number }> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT
        COALESCE(SUM(total_minor), 0) as total_charges,
        COALESCE(SUM(quantity), 0) as total_minutes
      FROM usage_charges
      WHERE organization_id = $1
        AND EXTRACT(YEAR FROM created_at) = $2
        AND EXTRACT(MONTH FROM created_at) = $3;
    `;
    const row = await db.queryOne<{ total_charges: string | number; total_minutes: string | number }>(sql, [
      organizationId,
      year,
      month,
    ]);

    return {
      totalChargesMinor: Number(row?.total_charges || 0),
      totalMinutes: Number(row?.total_minutes || 0),
    };
  }
}

export const usageChargeRepository = new UsageChargeRepository();
