import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingOrder, OrderPurpose, OrderStatus } from '@/types/billing';

export class BillingOrderRepository {
  async create(
    input: {
      id?: string;
      organizationId: string;
      razorpayOrderId: string;
      amountMinor: number;
      currency?: string;
      purpose: OrderPurpose;
      status?: OrderStatus;
      idempotencyKey?: string | null;
      metadata?: Record<string, unknown>;
    },
    client?: QueryClient
  ): Promise<BillingOrder> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_orders (
        id, organization_id, razorpay_order_id, amount_minor,
        currency, purpose, status, idempotency_key, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<BillingOrder>(sql, [
      id,
      input.organizationId,
      input.razorpayOrderId,
      input.amountMinor,
      input.currency || 'INR',
      input.purpose,
      input.status || 'CREATED',
      input.idempotencyKey || null,
      JSON.stringify(input.metadata || {}),
    ]);

    if (!row) throw new Error('Failed to create billing order');
    return row;
  }

  async findByRazorpayOrderId(
    razorpayOrderId: string,
    client?: QueryClient
  ): Promise<BillingOrder | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_orders WHERE razorpay_order_id = $1 LIMIT 1;`;
    return db.queryOne<BillingOrder>(sql, [razorpayOrderId]);
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<BillingOrder | null> {
    const db = client || (await ensureDatabaseReady());
    let sql = `SELECT * FROM billing_orders WHERE id = $1`;
    const params: unknown[] = [id];

    if (organizationId) {
      sql += ` AND organization_id = $2`;
      params.push(organizationId);
    }

    return db.queryOne<BillingOrder>(sql, params);
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    client?: QueryClient
  ): Promise<BillingOrder | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      UPDATE billing_orders
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    return db.queryOne<BillingOrder>(sql, [status, id]);
  }
}

export const billingOrderRepository = new BillingOrderRepository();
