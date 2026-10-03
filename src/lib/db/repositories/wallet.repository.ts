import { ensureDatabaseReady, QueryClient } from '../client';
import { generateUUID } from '@/lib/utils/crypto';
import { BillingWallet } from '@/types/billing';

export class InsufficientBalanceError extends Error {
  constructor(message = 'Insufficient prepaid wallet balance for transaction') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class WalletRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<BillingWallet | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_wallets WHERE organization_id = $1 LIMIT 1;`;
    return db.queryOne<BillingWallet>(sql, [organizationId]);
  }

  async findById(
    walletId: string,
    client?: QueryClient
  ): Promise<BillingWallet | null> {
    const db = client || (await ensureDatabaseReady());
    const sql = `SELECT * FROM billing_wallets WHERE id = $1 LIMIT 1;`;
    return db.queryOne<BillingWallet>(sql, [walletId]);
  }

  async create(
    input: {
      id?: string;
      organizationId: string;
      currency?: string;
      initialBalanceMinor?: number;
      lowBalanceThresholdMinor?: number;
    },
    client?: QueryClient
  ): Promise<BillingWallet> {
    const db = client || (await ensureDatabaseReady());
    const id = input.id || generateUUID();

    const sql = `
      INSERT INTO billing_wallets (
        id, organization_id, currency, balance_minor, reserved_minor,
        status, low_balance_threshold_minor, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 0,
        'ACTIVE', $5, NOW(), NOW()
      )
      ON CONFLICT (organization_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *;
    `;

    const row = await db.queryOne<BillingWallet>(sql, [
      id,
      input.organizationId,
      input.currency || 'INR',
      input.initialBalanceMinor ?? 0,
      input.lowBalanceThresholdMinor ?? 50000,
    ]);

    if (!row) throw new Error('Failed to create or fetch wallet');
    return row;
  }

  /**
   * Atomic wallet balance adjustment.
   * deltaMinor can be positive (credit) or negative (debit).
   * Enforces that (balance_minor + deltaMinor) >= 0 at database engine level.
   */
  async updateBalance(
    walletId: string,
    deltaMinor: number,
    client?: QueryClient
  ): Promise<BillingWallet> {
    const db = client || (await ensureDatabaseReady());

    const sql = `
      UPDATE billing_wallets
      SET
        balance_minor = balance_minor + $1,
        updated_at = NOW()
      WHERE id = $2 AND (balance_minor + $1) >= 0
      RETURNING *;
    `;

    const row = await db.queryOne<BillingWallet>(sql, [deltaMinor, walletId]);
    if (!row) {
      throw new InsufficientBalanceError(
        `Insufficient balance for debit of ${Math.abs(deltaMinor)} paise on wallet ${walletId}`
      );
    }

    return row;
  }

  async updateSettings(
    walletId: string,
    organizationId: string,
    updates: Partial<{
      low_balance_threshold_minor: number;
      auto_topup_enabled: boolean;
      auto_topup_threshold_minor: number;
      auto_topup_amount_minor: number;
      status: 'ACTIVE' | 'FROZEN';
    }>,
    client?: QueryClient
  ): Promise<BillingWallet | null> {
    const db = client || (await ensureDatabaseReady());
    const allowed = [
      'low_balance_threshold_minor',
      'auto_topup_enabled',
      'auto_topup_threshold_minor',
      'auto_topup_amount_minor',
      'status',
    ];

    const sets: string[] = [];
    const params: unknown[] = [walletId, organizationId];
    let idx = 3;

    for (const key of allowed) {
      if (key in updates) {
        sets.push(`${key} = $${idx}`);
        params.push((updates as Record<string, unknown>)[key]);
        idx++;
      }
    }

    if (sets.length === 0) return this.findById(walletId, client);

    sets.push(`updated_at = NOW()`);
    const sql = `
      UPDATE billing_wallets
      SET ${sets.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;
    return db.queryOne<BillingWallet>(sql, params);
  }
}

export const walletRepository = new WalletRepository();
