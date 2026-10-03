import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingInvoice, BillingInvoiceItem, InvoiceStatus } from '@/types/billing';

export class BillingInvoiceRepository {
  async create(
    invoiceInput: {
      id?: string;
      organizationId: string;
      invoiceNumber: string;
      razorpayInvoiceId?: string | null;
      subscriptionId?: string | null;
      subtotalMinor: number;
      discountMinor?: number;
      taxMinor?: number;
      totalMinor: number;
      currency?: string;
      status?: InvoiceStatus;
      issueDate?: string;
      dueDate?: string | null;
      paidAt?: string | null;
      billingPeriodStart?: string | null;
      billingPeriodEnd?: string | null;
      customerDetails?: Record<string, unknown>;
      taxDetails?: Record<string, unknown>;
      pdfUrl?: string | null;
    },
    items: Array<{
      description: string;
      quantity?: number;
      unit?: string;
      unitPriceMinor: number;
      subtotalMinor: number;
      taxRatePercent?: number;
      taxMinor?: number;
      totalMinor: number;
    }> = [],
    client?: QueryClient
  ): Promise<BillingInvoice> {
    const driver = await ensureDatabaseReady();
    const invoiceId = invoiceInput.id || generateUUID();

    const insertInvoice = async (tx: QueryClient) => {
      const invoiceSql = `
        INSERT INTO billing_invoices (
          id, organization_id, invoice_number, razorpay_invoice_id,
          subscription_id, subtotal_minor, discount_minor, tax_minor,
          total_minor, currency, status, issue_date,
          due_date, paid_at, billing_period_start, billing_period_end,
          customer_details, tax_details, pdf_url, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, NOW(), NOW()
        )
        RETURNING *;
      `;

      const invoice = await tx.queryOne<BillingInvoice>(invoiceSql, [
        invoiceId,
        invoiceInput.organizationId,
        invoiceInput.invoiceNumber,
        invoiceInput.razorpayInvoiceId || null,
        invoiceInput.subscriptionId || null,
        invoiceInput.subtotalMinor,
        invoiceInput.discountMinor ?? 0,
        invoiceInput.taxMinor ?? 0,
        invoiceInput.totalMinor,
        invoiceInput.currency || 'INR',
        invoiceInput.status || 'PAID',
        invoiceInput.issueDate || new Date().toISOString().split('T')[0],
        invoiceInput.dueDate || null,
        invoiceInput.paidAt || null,
        invoiceInput.billingPeriodStart || null,
        invoiceInput.billingPeriodEnd || null,
        JSON.stringify(invoiceInput.customerDetails || {}),
        JSON.stringify(invoiceInput.taxDetails || {}),
        invoiceInput.pdfUrl || null,
      ]);

      if (!invoice) throw new Error('Failed to create invoice');

      // Insert line items
      const createdItems: BillingInvoiceItem[] = [];
      for (const item of items) {
        const itemId = generateUUID();
        const itemSql = `
          INSERT INTO billing_invoice_items (
            id, invoice_id, description, quantity,
            unit, unit_price_minor, subtotal_minor,
            tax_rate_percent, tax_minor, total_minor, created_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10, NOW()
          )
          RETURNING *;
        `;
        const itemRow = await tx.queryOne<BillingInvoiceItem>(itemSql, [
          itemId,
          invoiceId,
          item.description,
          item.quantity ?? 1,
          item.unit || 'UNIT',
          item.unitPriceMinor,
          item.subtotalMinor,
          item.taxRatePercent ?? 18.00,
          item.taxMinor ?? 0,
          item.totalMinor,
        ]);
        if (itemRow) createdItems.push(itemRow);
      }

      invoice.items = createdItems;
      return invoice;
    };

    if (client) {
      return insertInvoice(client);
    } else {
      return driver.transaction(insertInvoice);
    }
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<BillingInvoice | null> {
    const db = client || (await ensureDatabaseReady());
    let sql = `SELECT * FROM billing_invoices WHERE id = $1`;
    const params: unknown[] = [id];

    if (organizationId) {
      sql += ` AND organization_id = $2`;
      params.push(organizationId);
    }

    const invoice = await db.queryOne<BillingInvoice>(sql, params);
    if (!invoice) return null;

    const items = await db.query<BillingInvoiceItem>(
      `SELECT * FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC;`,
      [invoice.id]
    );
    invoice.items = items;
    return invoice;
  }

  async findByInvoiceNumber(
    invoiceNumber: string,
    client?: QueryClient
  ): Promise<BillingInvoice | null> {
    const db = client || (await ensureDatabaseReady());
    const invoice = await db.queryOne<BillingInvoice>(
      `SELECT * FROM billing_invoices WHERE invoice_number = $1 LIMIT 1;`,
      [invoiceNumber]
    );
    if (!invoice) return null;

    const items = await db.query<BillingInvoiceItem>(
      `SELECT * FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC;`,
      [invoice.id]
    );
    invoice.items = items;
    return invoice;
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<{ invoices: BillingInvoice[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const countSql = `SELECT COUNT(*) as count FROM billing_invoices WHERE organization_id = $1;`;
    const listSql = `
      SELECT * FROM billing_invoices
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const [countRes, invoices] = await Promise.all([
      db.queryOne<{ count: string | number }>(countSql, [organizationId]),
      db.query<BillingInvoice>(listSql, [organizationId, limit, offset]),
    ]);

    return {
      invoices,
      total: Number(countRes?.count || 0),
    };
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: InvoiceStatus,
    paidAt?: string | null,
    client?: QueryClient
  ): Promise<BillingInvoice | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      UPDATE billing_invoices
      SET status = $1, paid_at = COALESCE($2, paid_at), updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *;
    `;
    return db.queryOne<BillingInvoice>(sql, [status, paidAt || null, id, organizationId]);
  }
}

export const billingInvoiceRepository = new BillingInvoiceRepository();
