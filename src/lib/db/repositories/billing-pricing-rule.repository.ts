import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingPricingRule } from '@/types/billing';

export class BillingPricingRuleRepository {
  async findByCode(code: string, client?: QueryClient): Promise<BillingPricingRule | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_pricing_rules WHERE code = $1 LIMIT 1;`;
    return db.queryOne<BillingPricingRule>(sql, [code]);
  }

  async findByUsageType(usageType: string, client?: QueryClient): Promise<BillingPricingRule | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM billing_pricing_rules
      WHERE usage_type = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    return db.queryOne<BillingPricingRule>(sql, [usageType]);
  }

  async listActive(client?: QueryClient): Promise<BillingPricingRule[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_pricing_rules WHERE is_active = true ORDER BY created_at ASC;`;
    return db.query<BillingPricingRule>(sql);
  }

  async create(input: Partial<BillingPricingRule>, client?: QueryClient): Promise<BillingPricingRule> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_pricing_rules (
        id, code, name, usage_type, unit_price_minor, currency,
        billing_unit, rounding_policy, minimum_charge_minor,
        tax_rate_percent, effective_from, effective_to, is_active, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, NOW(), NULL, $11, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<BillingPricingRule>(sql, [
      id,
      input.code,
      input.name,
      input.usage_type,
      input.unit_price_minor ?? 700,
      input.currency || 'INR',
      input.billing_unit || 'MINUTE',
      input.rounding_policy || 'PER_MINUTE_ROUNDED_UP',
      input.minimum_charge_minor ?? 0,
      input.tax_rate_percent ?? 18.00,
      input.is_active ?? true,
    ]);

    if (!row) throw new Error('Failed to create pricing rule');
    return row;
  }
}

export const billingPricingRuleRepository = new BillingPricingRuleRepository();
