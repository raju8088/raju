import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingPlan, BillingPlanPrice, BillingPlanStatus } from '@/types/billing';

export class BillingPlanRepository {
  async listPlans(status?: BillingPlanStatus, client?: QueryClient): Promise<BillingPlan[]> {
    const db = client || (await ensureDatabaseReady());
    let sql = `SELECT * FROM billing_plans`;
    const params: unknown[] = [];

    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY monthly_price_minor ASC;`;

    return db.query<BillingPlan>(sql, params);
  }

  async findById(id: string, client?: QueryClient): Promise<BillingPlan | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_plans WHERE id = $1;`;
    return db.queryOne<BillingPlan>(sql, [id]);
  }

  async findByCode(code: string, client?: QueryClient): Promise<BillingPlan | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_plans WHERE code = $1;`;
    return db.queryOne<BillingPlan>(sql, [code]);
  }

  async create(input: Partial<BillingPlan>, client?: QueryClient): Promise<BillingPlan> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();
    const sql = `
      INSERT INTO billing_plans (
        id, code, name, description, status, currency,
        monthly_price_minor, annual_price_minor, included_minutes, included_credits_minor,
        max_users, max_agents, max_campaigns, max_monthly_calls, max_concurrency,
        features, provider_plan_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<BillingPlan>(sql, [
      id,
      input.code,
      input.name,
      input.description || null,
      input.status || 'ACTIVE',
      input.currency || 'INR',
      input.monthly_price_minor ?? 0,
      input.annual_price_minor ?? 0,
      input.included_minutes ?? 0,
      input.included_credits_minor ?? 0,
      input.max_users ?? 5,
      input.max_agents ?? 2,
      input.max_campaigns ?? 5,
      input.max_monthly_calls ?? 1000,
      input.max_concurrency ?? 2,
      JSON.stringify(input.features || []),
      input.provider_plan_id || null,
    ]);

    if (!row) throw new Error('Failed to create billing plan');

    if (input.monthly_price_minor !== undefined) {
      await this.createPrice(
        {
          plan_id: row.id,
          billing_interval: 'MONTHLY',
          price_minor: input.monthly_price_minor,
          currency: input.currency || 'INR',
        },
        client
      );
    }

    return row;
  }

  async update(id: string, updates: Partial<BillingPlan>, client?: QueryClient): Promise<BillingPlan | null> {
    const db = client || (await ensureDatabaseReady());
    const allowed = [
      'name', 'description', 'status', 'currency',
      'monthly_price_minor', 'annual_price_minor', 'included_minutes', 'included_credits_minor',
      'max_users', 'max_agents', 'max_campaigns', 'max_monthly_calls', 'max_concurrency',
      'features', 'provider_plan_id'
    ];

    const sets: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;

    for (const key of allowed) {
      if (key in updates) {
        let val = (updates as Record<string, unknown>)[key];
        if (key === 'features' && Array.isArray(val)) {
          val = JSON.stringify(val);
        }
        sets.push(`${key} = $${idx}`);
        params.push(val);
        idx++;
      }
    }

    if (sets.length === 0) return this.findById(id, client);

    sets.push(`updated_at = NOW()`);
    const sql = `UPDATE billing_plans SET ${sets.join(', ')} WHERE id = $1 RETURNING *;`;
    return db.queryOne<BillingPlan>(sql, params);
  }

  // Versioned Prices (Section 9)
  async createPrice(input: Partial<BillingPlanPrice>, client?: QueryClient): Promise<BillingPlanPrice> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    // Find current max version
    const maxVerRow = await db.queryOne<{ max_ver: number }>(
      `SELECT COALESCE(MAX(version), 0) as max_ver FROM billing_plan_prices WHERE plan_id = $1 AND billing_interval = $2`,
      [input.plan_id, input.billing_interval || 'MONTHLY']
    );
    const nextVer = (maxVerRow?.max_ver || 0) + 1;

    // Expire previous version
    await db.query(
      `UPDATE billing_plan_prices SET effective_to = NOW() WHERE plan_id = $1 AND billing_interval = $2 AND effective_to IS NULL`,
      [input.plan_id, input.billing_interval || 'MONTHLY']
    );

    const sql = `
      INSERT INTO billing_plan_prices (
        id, plan_id, version, billing_interval, price_minor, currency, effective_from, effective_to, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), NULL, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<BillingPlanPrice>(sql, [
      id,
      input.plan_id,
      nextVer,
      input.billing_interval || 'MONTHLY',
      input.price_minor,
      input.currency || 'INR',
    ]);

    if (!row) throw new Error('Failed to create versioned plan price');
    return row;
  }

  async listPrices(planId: string, client?: QueryClient): Promise<BillingPlanPrice[]> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_plan_prices WHERE plan_id = $1 ORDER BY version DESC;`;
    return db.query<BillingPlanPrice>(sql, [planId]);
  }

  // Aliases for clean service/test access
  createPlan = this.create.bind(this);
  updatePlan = this.update.bind(this);
  createPriceVersion = this.createPrice.bind(this);
  getPriceHistory = async (planId: string, client?: QueryClient): Promise<BillingPlanPrice[]> => {
    const prices = await this.listPrices(planId, client);
    return prices.sort((a, b) => a.version - b.version);
  };
}

export const billingPlanRepository = new BillingPlanRepository();
