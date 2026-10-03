import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingWalletLedger, WalletLedgerEntryType } from '@/types/billing';

export class WalletLedgerRepository {
  async create(
    input: {
      id?: string;
      organizationId: string;
      walletId: string;
      entryType: WalletLedgerEntryType;
      amountMinor: number;
      balanceAfterMinor: number;
      referenceType: 'PAYMENT' | 'USAGE_CHARGE' | 'SUBSCRIPTION' | 'INVOICE' | 'MANUAL_ADMIN' | 'PROMOTION';
      referenceId?: string | null;
      idempotencyKey?: string | null;
      description: string;
      createdBy?: string | null;
    },
    client?: QueryClient
  ): Promise<BillingWalletLedger> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_wallet_ledger (
        id, organization_id, wallet_id, entry_type,
        amount_minor, balance_after_minor, reference_type,
        reference_id, idempotency_key, description,
        created_by, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, NOW()
      )
      RETURNING *;
    `;

    const row = await db.queryOne<BillingWalletLedger>(sql, [
      id,
      input.organizationId,
      input.walletId,
      input.entryType,
      input.amountMinor,
      input.balanceAfterMinor,
      input.referenceType,
      input.referenceId || null,
      input.idempotencyKey || null,
      input.description,
      input.createdBy || null,
    ]);

    if (!row) throw new Error('Failed to create wallet ledger entry');
    return row;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: QueryClient
  ): Promise<BillingWalletLedger | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT * FROM billing_wallet_ledger
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1;
    `;
    return db.queryOne<BillingWalletLedger>(sql, [organizationId, idempotencyKey]);
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
    offset = 0,
    client?: QueryClient
  ): Promise<{ entries: BillingWalletLedger[]; total: number }> {
    const db = client || (await ensureDatabaseReady());
    const countSql = `SELECT COUNT(*) as count FROM billing_wallet_ledger WHERE organization_id = $1;`;
    const listSql = `
      SELECT * FROM billing_wallet_ledger
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const [countRes, entries] = await Promise.all([
      db.queryOne<{ count: string | number }>(countSql, [organizationId]),
      db.query<BillingWalletLedger>(listSql, [organizationId, limit, offset]),
    ]);

    return {
      entries,
      total: Number(countRes?.count || 0),
    };
  }

  /**
   * Sum of all ledger amounts for reconciliation against wallet.balance_minor (Section 92)
   */
  async getLedgerBalanceSum(organizationId: string, client?: QueryClient): Promise<number> {
    const db = client || (await ensureDatabaseReady());
    const sql = `
      SELECT COALESCE(SUM(amount_minor), 0) as total_sum
      FROM billing_wallet_ledger
      WHERE organization_id = $1;
    `;
    const row = await db.queryOne<{ total_sum: string | number }>(sql, [organizationId]);
    return Number(row?.total_sum || 0);
  }
}

export const walletLedgerRepository = new WalletLedgerRepository();
