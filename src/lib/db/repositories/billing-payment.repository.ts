import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingPayment, PaymentStatus, PaymentMethod } from '@/types/billing';

export class BillingPaymentRepository {
  async create(
    input: {
      id?: string;
      organizationId: string;
      orderId?: string | null;
      razorpayPaymentId: string;
      razorpayOrderId?: string | null;
      amountMinor: number;
      currency?: string;
      status: PaymentStatus;
      method?: PaymentMethod;
      signature?: string | null;
      capturedAt?: string | null;
      failureReasonSafe?: string | null;
    },
    client?: QueryClient
  ): Promise<BillingPayment> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_payments (
        id, organization_id, order_id, razorpay_payment_id,
        razorpay_order_id, amount_minor, currency, status,
        method, signature, captured_at, failure_reason_safe, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, NOW()
      )
      ON CONFLICT (razorpay_payment_id) DO UPDATE SET
        status = EXCLUDED.status,
        captured_at = COALESCE(EXCLUDED.captured_at, billing_payments.captured_at),
        failure_reason_safe = COALESCE(EXCLUDED.failure_reason_safe, billing_payments.failure_reason_safe)
      RETURNING *;
    `;

    const row = await db.queryOne<BillingPayment>(sql, [
      id,
      input.organizationId,
      input.orderId || null,
      input.razorpayPaymentId,
      input.razorpayOrderId || null,
      input.amountMinor,
      input.currency || 'INR',
      input.status,
      input.method || 'UNKNOWN',
      input.signature || null,
      input.capturedAt || null,
      input.failureReasonSafe || null,
    ]);

    if (!row) throw new Error('Failed to create billing payment record');
    return row;
  }

  async findByRazorpayPaymentId(
    razorpayPaymentId: string,
    client?: QueryClient
  ): Promise<BillingPayment | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_payments WHERE razorpay_payment_id = $1 LIMIT 1;`;
    return db.queryOne<BillingPayment>(sql, [razorpayPaymentId]);
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<{ payments: BillingPayment[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const countSql = `SELECT COUNT(*) as count FROM billing_payments WHERE organization_id = $1;`;
    const listSql = `
      SELECT * FROM billing_payments
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const [countRes, payments] = await Promise.all([
      db.queryOne<{ count: string | number }>(countSql, [organizationId]),
      db.query<BillingPayment>(listSql, [organizationId, limit, offset]),
    ]);

    return {
      payments,
      total: Number(countRes?.count || 0),
    };
  }
}

export const billingPaymentRepository = new BillingPaymentRepository();
