import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { OrganizationSubscription, SubscriptionStatus, BillingInterval } from '@/types/billing';

export class SubscriptionRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<OrganizationSubscription | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT s.*, p.name as plan_name, p.code as plan_code
      FROM organization_subscriptions s
      LEFT JOIN billing_plans p ON s.plan_id = p.id
      WHERE s.organization_id = $1
      ORDER BY s.created_at DESC
      LIMIT 1;
    `;
    return db.queryOne<OrganizationSubscription>(sql, [organizationId]);
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<OrganizationSubscription | null> {
    const db = client || (await ensureDatabaseReady());
    let sql = `
      SELECT s.*, p.name as plan_name, p.code as plan_code
      FROM organization_subscriptions s
      LEFT JOIN billing_plans p ON s.plan_id = p.id
      WHERE s.id = $1
    `;
    const params: unknown[] = [id];

    if (organizationId) {
      sql += ` AND s.organization_id = $2`;
      params.push(organizationId);
    }

    return db.queryOne<OrganizationSubscription>(sql, params);
  }

  async findByRazorpaySubscriptionId(
    razorpaySubscriptionId: string,
    client?: QueryClient
  ): Promise<OrganizationSubscription | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT s.*, p.name as plan_name, p.code as plan_code
      FROM organization_subscriptions s
      LEFT JOIN billing_plans p ON s.plan_id = p.id
      WHERE s.razorpay_subscription_id = $1
      LIMIT 1;
    `;
    return db.queryOne<OrganizationSubscription>(sql, [razorpaySubscriptionId]);
  }

  async create(
    input: {
      id?: string;
      organizationId: string;
      planId: string;
      planPriceId?: string | null;
      status?: SubscriptionStatus;
      billingInterval?: BillingInterval;
      razorpaySubscriptionId?: string | null;
      razorpayCustomerId?: string | null;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      trialStart?: string | null;
      trialEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
      activatedAt?: string | null;
    },
    client?: QueryClient
  ): Promise<OrganizationSubscription> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO organization_subscriptions (
        id, organization_id, plan_id, plan_price_id, status,
        billing_interval, razorpay_subscription_id, razorpay_customer_id,
        current_period_start, current_period_end, trial_start, trial_end,
        cancel_at_period_end, activated_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<OrganizationSubscription>(sql, [
      id,
      input.organizationId,
      input.planId,
      input.planPriceId || null,
      input.status || 'TRIAL',
      input.billingInterval || 'MONTHLY',
      input.razorpaySubscriptionId || null,
      input.razorpayCustomerId || null,
      input.currentPeriodStart || null,
      input.currentPeriodEnd || null,
      input.trialStart || null,
      input.trialEnd || null,
      input.cancelAtPeriodEnd ?? false,
      input.activatedAt || null,
    ]);

    if (!row) throw new Error('Failed to create organization subscription');
    return row;
  }

  async update(
    id: string,
    organizationId: string,
    updates: Partial<{
      plan_id: string;
      plan_price_id: string | null;
      status: SubscriptionStatus;
      billing_interval: BillingInterval;
      razorpay_subscription_id: string | null;
      razorpay_customer_id: string | null;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      canceled_at: string | null;
      activated_at: string | null;
    }>,
    client?: QueryClient
  ): Promise<OrganizationSubscription | null> {
    const db = client || (await ensureDatabaseReady());
    const allowed = [
      'plan_id', 'plan_price_id', 'status', 'billing_interval',
      'razorpay_subscription_id', 'razorpay_customer_id',
      'current_period_start', 'current_period_end',
      'cancel_at_period_end', 'canceled_at', 'activated_at'
    ];

    const sets: string[] = [];
    const params: unknown[] = [id, organizationId];
    let idx = 3;

    for (const key of allowed) {
      if (key in updates) {
        sets.push(`${key} = $${idx}`);
        params.push((updates as Record<string, unknown>)[key]);
        idx++;
      }
    }

    if (sets.length === 0) return this.findById(id, organizationId, client);

    sets.push(`updated_at = NOW()`);
    const sql = `
      UPDATE organization_subscriptions
      SET ${sets.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;
    return db.queryOne<OrganizationSubscription>(sql, params);
  }
}

export const subscriptionRepository = new SubscriptionRepository();
