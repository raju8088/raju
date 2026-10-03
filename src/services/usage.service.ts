import { ensureDatabaseReady, QueryClient } from '@/lib/db/client';
import { usageEventRepository } from '@/lib/db/repositories/usage-event.repository';
import { usageChargeRepository } from '@/lib/db/repositories/usage-charge.repository';
import { billingPricingRuleRepository } from '@/lib/db/repositories/billing-pricing-rule.repository';
import { walletService } from './wallet.service';
import { entitlementService } from './entitlement.service';
import { UsageEvent, UsageCharge, UsageRoundingPolicy } from '@/types/billing';
import { logger } from '@/lib/utils/logger';

export class UsageService {
  /**
   * Calculate billable quantity in minutes based on duration and configured rounding policy (Sections 29, 30)
   */
  calculateBillableQuantity(durationSeconds: number, policy: UsageRoundingPolicy): number {
    if (durationSeconds <= 0) return 0;

    switch (policy) {
      case 'PER_MINUTE_ROUNDED_UP':
        return Math.ceil(durationSeconds / 60);
      case 'PER_SECOND':
        return Number((durationSeconds / 60).toFixed(4));
      case 'PER_MINUTE_EXACT':
        return Math.round((durationSeconds / 60) * 100) / 100;
      default:
        return Math.ceil(durationSeconds / 60);
    }
  }

  /**
   * Finalize and charge call usage atomically with double-billing protection (Sections 32, 33, 69)
   */
  async recordCallUsage(
    organizationId: string,
    params: {
      provider?: string;
      providerCallId?: string | null;
      callId?: string | null;
      campaignId?: string | null;
      leadId?: string | null;
      durationSeconds: number;
      usageType?: 'VOICE_OUTBOUND' | 'VOICE_INBOUND' | 'BULK_CAMPAIGN';
      source?: string;
    },
    client?: QueryClient
  ): Promise<{ event: UsageEvent; charge: UsageCharge | null }> {
    const driver = await ensureDatabaseReady();
    const provider = params.provider || 'OMNIDIMENSION';
    const providerCallId = params.providerCallId || null;
    const callId = params.callId || null;
    const usageType = params.usageType || 'VOICE_OUTBOUND';

    // 1. Build deterministic idempotency key
    const idempotencyKey = `usage_${organizationId}_${provider}_${providerCallId || callId || Date.now()}`;

    // Resolve entitlements outside transaction to prevent connection lock contention
    const entitlements = await entitlementService.getEntitlements(organizationId);

    const execute = async (tx: QueryClient) => {
      // 2. Double-charge protection: check if usage event already recorded
      const existingEvent = await usageEventRepository.findByIdempotencyKey(
        organizationId,
        idempotencyKey,
        tx
      );
      if (existingEvent) {
        logger.info('usage.duplicate_charge_prevented', {
          action: 'USAGE_CHARGE_IDEMPOTENT',
          metadata: { idempotencyKey, organizationId, providerCallId },
        });
        const existingCharge = await usageChargeRepository.findByUsageEventId(existingEvent.id, tx);
        return { event: existingEvent, charge: existingCharge };
      }

      // 3. Resolve active pricing rule
      let pricingRule = await billingPricingRuleRepository.findByUsageType(usageType, tx);
      if (!pricingRule) {
        pricingRule = await billingPricingRuleRepository.findByCode('VOICE_OUTBOUND_STD', tx);
      }

      const roundingPolicy: UsageRoundingPolicy =
        pricingRule?.rounding_policy || 'PER_MINUTE_ROUNDED_UP';
      const unitPriceMinor = pricingRule?.unit_price_minor ?? 700; // ₹7.00/min
      const taxRatePercent = Number(pricingRule?.tax_rate_percent || 18.00);

      // 4. Calculate billable quantity
      const billableMinutes = this.calculateBillableQuantity(
        params.durationSeconds,
        roundingPolicy
      );

      // If call duration is 0 seconds (unanswered/busy), non-billable by default policy (Section 109)
      const isZeroUsage = billableMinutes <= 0 || params.durationSeconds <= 0;

      // 5. Check included minutes priority (Section 38, 39)
      const isCoveredByIncludedMinutes = !isZeroUsage && entitlements.includedMinutesRemaining >= billableMinutes;

      // Calculate monetary charges
      const subtotalMinor = isZeroUsage || isCoveredByIncludedMinutes ? 0 : Math.round(billableMinutes * unitPriceMinor);
      const taxMinor = Math.round(subtotalMinor * (taxRatePercent / 100));
      const totalMinor = subtotalMinor + taxMinor;

      // 6. Record immutable usage event
      const event = await usageEventRepository.create(
        {
          organizationId,
          provider,
          providerCallId,
          callId,
          campaignId: params.campaignId,
          leadId: params.leadId,
          usageType,
          quantity: billableMinutes,
          unit: 'MINUTE',
          durationSeconds: params.durationSeconds,
          source: params.source || 'PROVIDER_COMPLETED',
          idempotencyKey,
        },
        tx
      );

      let walletLedgerId: string | null = null;

      // 7. Debit wallet if monetary charge is non-zero
      if (totalMinor > 0) {
        try {
          const debitRes = await walletService.debitWallet(
            organizationId,
            totalMinor,
            {
              entryType: 'USAGE_DEBIT',
              referenceType: 'USAGE_CHARGE',
              referenceId: event.id,
              idempotencyKey: `debit_${idempotencyKey}`,
              description: `Voice call usage: ${billableMinutes} min(s) @ ₹${(unitPriceMinor / 100).toFixed(2)}/min + ${taxRatePercent}% GST`,
            },
            tx
          );
          walletLedgerId = debitRes.ledgerEntry.id;
        } catch (err) {
          logger.warn('usage.wallet_debit_overage', {
            action: 'USAGE_DEBIT_OVERAGE',
            organization: { id: organizationId },
            errorMessage: (err as Error).message,
          });
          // Call already happened; record charge in usage_charges even if wallet is depleted
        }
      }

      // 8. Create usage charge record with historical rate snapshot
      const charge = await usageChargeRepository.create(
        {
          organizationId,
          usageEventId: event.id,
          pricingRuleId: pricingRule?.id,
          quantity: billableMinutes,
          unitPriceMinor,
          subtotalMinor,
          taxMinor,
          totalMinor,
          currency: 'INR',
          status: 'SETTLED',
          walletLedgerId,
        },
        tx
      );

      logger.info('usage.call_charged_success', {
        action: 'USAGE_CHARGED',
        organization: { id: organizationId },
        metadata: {
          callId,
          providerCallId,
          durationSeconds: params.durationSeconds,
          billableMinutes,
          totalMinor,
          isIncludedMinutes: isCoveredByIncludedMinutes,
        },
      });

      return { event, charge };
    };

    if (client) {
      return execute(client);
    } else {
      return driver.transaction(execute);
    }
  }

  async listUsageCharges(
    organizationId: string,
    limit = 50,
    offset = 0
  ): Promise<{ charges: UsageCharge[]; total: number }> {
    return usageChargeRepository.listByOrganization(organizationId, limit, offset);
  }
}

export const usageService = new UsageService();
