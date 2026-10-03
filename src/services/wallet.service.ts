import { ensureDatabaseReady, QueryClient } from '@/lib/db/client';
import { walletRepository, InsufficientBalanceError } from '@/lib/db/repositories/wallet.repository';
export { InsufficientBalanceError };
import { walletLedgerRepository } from '@/lib/db/repositories/wallet-ledger.repository';
import { BillingWallet, BillingWalletLedger, WalletLedgerEntryType } from '@/types/billing';
import { logger } from '@/lib/utils/logger';

export class WalletService {
  async getWallet(organizationId: string): Promise<BillingWallet> {
    let wallet = await walletRepository.findByOrganizationId(organizationId);
    if (!wallet) {
      wallet = await walletRepository.create({ organizationId });
    }
    return wallet;
  }

  async getLedger(
    organizationId: string,
    limit = 50,
    offset = 0
  ): Promise<{ entries: BillingWalletLedger[]; total: number }> {
    return walletLedgerRepository.listByOrganization(organizationId, limit, offset);
  }

  /**
   * Credit wallet with financial idempotency and append-only ledger record.
   */
  async creditWallet(
    organizationId: string,
    amountMinor: number,
    params: {
      entryType: WalletLedgerEntryType;
      referenceType: 'PAYMENT' | 'USAGE_CHARGE' | 'SUBSCRIPTION' | 'INVOICE' | 'MANUAL_ADMIN' | 'PROMOTION';
      referenceId?: string | null;
      idempotencyKey?: string | null;
      description: string;
      createdBy?: string | null;
    },
    client?: QueryClient
  ): Promise<{ wallet: BillingWallet; ledgerEntry: BillingWalletLedger }> {
    if (amountMinor <= 0) {
      throw new Error(`Credit amount must be strictly positive: got ${amountMinor}`);
    }

    const driver = await ensureDatabaseReady();

    const execute = async (tx: QueryClient) => {
      // 1. Check idempotency if key provided
      if (params.idempotencyKey) {
        const existing = await walletLedgerRepository.findByIdempotencyKey(
          organizationId,
          params.idempotencyKey,
          tx
        );
        if (existing) {
          logger.info('wallet.credit_replay', {
            action: 'WALLET_CREDIT_REPLAY',
            metadata: { idempotencyKey: params.idempotencyKey, organizationId },
          });
          const currentWallet = await this.getWallet(organizationId);
          return { wallet: currentWallet, ledgerEntry: existing };
        }
      }

      // 2. Ensure wallet exists
      let wallet = await walletRepository.findByOrganizationId(organizationId, tx);
      if (!wallet) {
        wallet = await walletRepository.create({ organizationId }, tx);
      }

      // 3. Atomically update wallet balance
      const updatedWallet = await walletRepository.updateBalance(wallet.id, amountMinor, tx);

      // 4. Record immutable ledger entry
      const ledgerEntry = await walletLedgerRepository.create(
        {
          organizationId,
          walletId: wallet.id,
          entryType: params.entryType,
          amountMinor,
          balanceAfterMinor: updatedWallet.balance_minor,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          idempotencyKey: params.idempotencyKey,
          description: params.description,
          createdBy: params.createdBy,
        },
        tx
      );

      logger.info('wallet.credit_success', {
        action: 'WALLET_CREDIT',
        organization: { id: organizationId },
        metadata: {
          amountMinor,
          newBalance: updatedWallet.balance_minor,
          entryType: params.entryType,
        },
      });

      return { wallet: updatedWallet, ledgerEntry };
    };

    if (client) {
      return execute(client);
    } else {
      return driver.transaction(execute);
    }
  }

  /**
   * Debit wallet atomically with balance guard (balance >= 0) and immutable ledger record.
   */
  async debitWallet(
    organizationId: string,
    amountMinor: number,
    params: {
      entryType: WalletLedgerEntryType;
      referenceType: 'PAYMENT' | 'USAGE_CHARGE' | 'SUBSCRIPTION' | 'INVOICE' | 'MANUAL_ADMIN' | 'PROMOTION';
      referenceId?: string | null;
      idempotencyKey?: string | null;
      description: string;
      createdBy?: string | null;
    },
    client?: QueryClient
  ): Promise<{ wallet: BillingWallet; ledgerEntry: BillingWalletLedger }> {
    if (amountMinor <= 0) {
      throw new Error(`Debit amount must be strictly positive: got ${amountMinor}`);
    }

    const driver = await ensureDatabaseReady();

    const execute = async (tx: QueryClient) => {
      // 1. Check idempotency if key provided
      if (params.idempotencyKey) {
        const existing = await walletLedgerRepository.findByIdempotencyKey(
          organizationId,
          params.idempotencyKey,
          tx
        );
        if (existing) {
          logger.info('wallet.debit_replay', {
            action: 'WALLET_DEBIT_REPLAY',
            metadata: { idempotencyKey: params.idempotencyKey, organizationId },
          });
          const currentWallet = await this.getWallet(organizationId);
          return { wallet: currentWallet, ledgerEntry: existing };
        }
      }

      // 2. Ensure wallet exists
      const wallet = await walletRepository.findByOrganizationId(organizationId, tx);
      if (!wallet) {
        throw new InsufficientBalanceError(`No wallet found for organization ${organizationId}`);
      }

      // 3. Atomically update wallet balance with negative delta (guarantees balance >= 0)
      const updatedWallet = await walletRepository.updateBalance(wallet.id, -amountMinor, tx);

      // 4. Record immutable ledger entry (negative amount)
      const ledgerEntry = await walletLedgerRepository.create(
        {
          organizationId,
          walletId: wallet.id,
          entryType: params.entryType,
          amountMinor: -amountMinor,
          balanceAfterMinor: updatedWallet.balance_minor,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          idempotencyKey: params.idempotencyKey,
          description: params.description,
          createdBy: params.createdBy,
        },
        tx
      );

      logger.info('wallet.debit_success', {
        action: 'WALLET_DEBIT',
        organization: { id: organizationId },
        metadata: {
          amountMinor,
          newBalance: updatedWallet.balance_minor,
          entryType: params.entryType,
        },
      });

      return { wallet: updatedWallet, ledgerEntry };
    };

    if (client) {
      return execute(client);
    } else {
      return driver.transaction(execute);
    }
  }

  /**
   * Reconcile materialized wallet balance against append-only ledger entries (Section 92, 95)
   */
  async reconcileWallet(organizationId: string): Promise<{
    walletBalanceMinor: number;
    ledgerSumMinor: number;
    isBalanced: boolean;
    differenceMinor: number;
  }> {
    const wallet = await this.getWallet(organizationId);
    const ledgerSum = await walletLedgerRepository.getLedgerBalanceSum(organizationId);

    const differenceMinor = wallet.balance_minor - ledgerSum;
    const isBalanced = differenceMinor === 0;

    if (!isBalanced) {
      logger.warn('wallet.reconciliation_mismatch', {
        action: 'WALLET_RECONCILE',
        organization: { id: organizationId },
        metadata: {
          walletBalance: wallet.balance_minor,
          ledgerSum,
          differenceMinor,
        },
      });
    }

    return {
      walletBalanceMinor: wallet.balance_minor,
      ledgerSumMinor: ledgerSum,
      isBalanced,
      differenceMinor,
    };
  }

  async updateSettings(
    organizationId: string,
    updates: {
      lowBalanceThresholdMinor?: number;
      autoTopupEnabled?: boolean;
      autoTopupThresholdMinor?: number;
      autoTopupAmountMinor?: number;
    }
  ): Promise<BillingWallet> {
    const wallet = await this.getWallet(organizationId);
    const updated = await walletRepository.updateSettings(wallet.id, organizationId, {
      low_balance_threshold_minor: updates.lowBalanceThresholdMinor,
      auto_topup_enabled: updates.autoTopupEnabled,
      auto_topup_threshold_minor: updates.autoTopupThresholdMinor,
      auto_topup_amount_minor: updates.autoTopupAmountMinor,
    });
    return updated || wallet;
  }
}

export const walletService = new WalletService();
