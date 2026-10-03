import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingCustomer, BillingAddress } from '@/types/billing';

export class BillingCustomerRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<BillingCustomer | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_customers WHERE organization_id = $1 LIMIT 1;`;
    return db.queryOne<BillingCustomer>(sql, [organizationId]);
  }

  async findByRazorpayCustomerId(
    razorpayCustomerId: string,
    client?: QueryClient
  ): Promise<BillingCustomer | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_customers WHERE razorpay_customer_id = $1 LIMIT 1;`;
    return db.queryOne<BillingCustomer>(sql, [razorpayCustomerId]);
  }

  async upsert(
    input: {
      organizationId: string;
      name: string;
      email: string;
      phone?: string | null;
      razorpayCustomerId?: string | null;
      billingAddress?: BillingAddress;
      businessLegalName?: string | null;
      gstin?: string | null;
      isGstRegistered?: boolean;
      placeOfSupply?: string | null;
    },
    client?: QueryClient
  ): Promise<BillingCustomer> {
    const db = client || (await ensureDatabaseReady());
    const id = generateUUID();

    const sql = `
      INSERT INTO billing_customers (
        id, organization_id, razorpay_customer_id, name, email, phone,
        billing_address, business_legal_name, gstin, is_gst_registered,
        place_of_supply, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, NOW(), NOW()
      )
      ON CONFLICT (organization_id) DO UPDATE SET
        razorpay_customer_id = COALESCE(EXCLUDED.razorpay_customer_id, billing_customers.razorpay_customer_id),
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = COALESCE(EXCLUDED.phone, billing_customers.phone),
        billing_address = EXCLUDED.billing_address,
        business_legal_name = COALESCE(EXCLUDED.business_legal_name, billing_customers.business_legal_name),
        gstin = COALESCE(EXCLUDED.gstin, billing_customers.gstin),
        is_gst_registered = EXCLUDED.is_gst_registered,
        place_of_supply = COALESCE(EXCLUDED.place_of_supply, billing_customers.place_of_supply),
        updated_at = NOW()
      RETURNING *;
    `;

    const row = await db.queryOne<BillingCustomer>(sql, [
      id,
      input.organizationId,
      input.razorpayCustomerId || null,
      input.name,
      input.email,
      input.phone || null,
      JSON.stringify(input.billingAddress || {}),
      input.businessLegalName || null,
      input.gstin || null,
      input.isGstRegistered ?? false,
      input.placeOfSupply || null,
    ]);

    if (!row) throw new Error('Failed to upsert billing customer');
    return row;
  }

  create = this.upsert.bind(this);
}

export const billingCustomerRepository = new BillingCustomerRepository();
