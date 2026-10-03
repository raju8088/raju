import { ensureDatabaseReady } from '@/lib/db/client';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { subscriptionRepository } from '@/lib/db/repositories/subscription.repository';
import { billingCustomerRepository } from '@/lib/db/repositories/billing-customer.repository';
import { billingInvoiceRepository } from '@/lib/db/repositories/billing-invoice.repository';
import { usageChargeRepository } from '@/lib/db/repositories/usage-charge.repository';
import { walletService } from './wallet.service';
import {
  OrgBillingSummary,
  AdminBillingKPIs,
  ReconciliationReport,
  BillingPlan,
  BillingInvoice,
} from '@/types/billing';

export class BillingService {
  async getOrganizationBillingSummary(organizationId: string): Promise<OrgBillingSummary> {
    // 1. Fetch Subscription, Plan, Wallet, Customer in parallel
    const [subscription, wallet, customer] = await Promise.all([
      subscriptionRepository.findByOrganizationId(organizationId),
      walletService.getWallet(organizationId),
      billingCustomerRepository.findByOrganizationId(organizationId),
    ]);

    let plan: BillingPlan | null = null;
    if (subscription?.plan_id) {
      plan = await billingPlanRepository.findById(subscription.plan_id);
    }
    if (!plan) {
      plan = await billingPlanRepository.findByCode('STARTER');
    }

    // 2. Included minutes calculations for the current calendar month
    const now = new Date();
    const includedMinutesTotal = plan?.included_minutes ?? 500;

    const usageSum = await usageChargeRepository.sumUsageForMonth(
      organizationId,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1
    );

    const includedMinutesUsed = usageSum.totalMinutes;
    const includedMinutesRemaining = Math.max(0, includedMinutesTotal - includedMinutesUsed);

    // 3. Compute billing status (Section 99)
    let computedBillingStatus: OrgBillingSummary['computedBillingStatus'] = 'BILLING_ACTIVE';
    const subStatus = subscription?.status || 'TRIAL';

    if (subStatus === 'SUSPENDED') {
      computedBillingStatus = 'BILLING_SUSPENDED';
    } else if (subStatus === 'CANCELED' || subStatus === 'EXPIRED') {
      computedBillingStatus = 'BILLING_CANCELED';
    } else if (subStatus === 'PAST_DUE') {
      computedBillingStatus = 'BILLING_GRACE';
    } else {
      computedBillingStatus = 'BILLING_ACTIVE';
    }

    return {
      subscription,
      plan,
      wallet,
      customer,
      includedMinutesTotal,
      includedMinutesUsed,
      includedMinutesRemaining,
      currentMonthUsageMinor: usageSum.totalChargesMinor,
      computedBillingStatus,
    };
  }

  async listInvoices(
    organizationId: string,
    limit = 50,
    offset = 0
  ): Promise<{ invoices: BillingInvoice[]; total: number }> {
    return billingInvoiceRepository.listByOrganization(organizationId, limit, offset);
  }

  async getInvoice(id: string, organizationId: string): Promise<BillingInvoice | null> {
    return billingInvoiceRepository.findById(id, organizationId);
  }

  async getAdminKPIs(): Promise<AdminBillingKPIs> {
    const db = await ensureDatabaseReady();

    // 1. Subscription stats
    const subStats = await db.query<{ status: string; count: string | number }>(`
      SELECT status, COUNT(*) as count
      FROM organization_subscriptions
      GROUP BY status;
    `);

    let activeSubs = 0;
    let trialSubs = 0;
    let pastDueSubs = 0;
    let canceledSubs = 0;

    for (const row of subStats) {
      const c = Number(row.count);
      if (row.status === 'ACTIVE') activeSubs += c;
      else if (row.status === 'TRIAL') trialSubs += c;
      else if (row.status === 'PAST_DUE') pastDueSubs += c;
      else if (row.status === 'CANCELED' || row.status === 'EXPIRED') canceledSubs += c;
    }

    // 2. Total recorded revenue from paid invoices
    const revRow = await db.queryOne<{ total_rev: string | number }>(`
      SELECT COALESCE(SUM(total_minor), 0) as total_rev
      FROM billing_invoices
      WHERE status = 'PAID';
    `);

    // 3. Total prepaid wallet balances across all organizations
    const walletRow = await db.queryOne<{ total_wallet: string | number }>(`
      SELECT COALESCE(SUM(balance_minor), 0) as total_wallet
      FROM billing_wallets;
    `);

    // 4. Monthly usage metrics
    const now = new Date();
    const usageRow = await db.queryOne<{ total_minutes: string | number; total_calls: string | number }>(`
      SELECT
        COALESCE(SUM(quantity), 0) as total_minutes,
        COUNT(*) as total_calls
      FROM usage_events
      WHERE EXTRACT(YEAR FROM created_at) = $1
        AND EXTRACT(MONTH FROM created_at) = $2;
    `, [now.getUTCFullYear(), now.getUTCMonth() + 1]);

    // 5. Failed payments
    const failedPayRow = await db.queryOne<{ count: string | number }>(`
      SELECT COUNT(*) as count FROM billing_payments WHERE status = 'FAILED';
    `);

    // 6. Reconciliation discrepancies count
    const reconReport = await this.runReconciliation();

    return {
      recordedRevenueMinor: Number(revRow?.total_rev || 0),
      activeSubscriptionsCount: activeSubs,
      trialSubscriptionsCount: trialSubs,
      pastDueSubscriptionsCount: pastDueSubs,
      canceledSubscriptionsCount: canceledSubs,
      totalPrepaidWalletBalanceMinor: Number(walletRow?.total_wallet || 0),
      monthlyBilledMinutes: Number(usageRow?.total_minutes || 0),
      monthlyBilledCalls: Number(usageRow?.total_calls || 0),
      failedPaymentsCount: Number(failedPayRow?.count || 0),
      reconciliationDiscrepanciesCount: reconReport.discrepancyCount,
    };
  }

  /**
   * Comprehensive cross-system financial and usage reconciliation (Section 67, 68)
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const db = await ensureDatabaseReady();
    const discrepancies: ReconciliationReport['discrepancies'] = [];

    // 1. Detect completed calls missing usage events
    const unbilledCalls = await db.query<{ id: string; provider_call_id: string; duration_seconds: number }>(`
      SELECT c.id, c.provider_call_id, c.duration_seconds
      FROM calls c
      LEFT JOIN usage_events ue ON c.id = ue.call_id
      WHERE c.status = 'COMPLETED'
        AND c.duration_seconds > 0
        AND ue.id IS NULL
      LIMIT 20;
    `);

    for (const c of unbilledCalls) {
      discrepancies.push({
        type: 'CALL_WITHOUT_USAGE',
        entityId: c.id,
        details: `Completed call ${c.id} (${c.duration_seconds}s) lacks usage event record`,
      });
    }

    // 2. Detect usage events missing charges
    const unchargedEvents = await db.query<{ id: string; duration_seconds: number }>(`
      SELECT ue.id, ue.duration_seconds
      FROM usage_events ue
      LEFT JOIN usage_charges uc ON ue.id = uc.usage_event_id
      WHERE uc.id IS NULL
      LIMIT 20;
    `);

    for (const ue of unchargedEvents) {
      discrepancies.push({
        type: 'USAGE_WITHOUT_CHARGE',
        entityId: ue.id,
        details: `Usage event ${ue.id} (${ue.duration_seconds}s) lacks calculated charge`,
      });
    }

    // 3. Detect wallet balance vs append-only ledger mismatches
    const wallets = await db.query<{ id: string; organization_id: string; balance_minor: number }>(`
      SELECT id, organization_id, balance_minor FROM billing_wallets LIMIT 50;
    `);

    for (const w of wallets) {
      const recon = await walletService.reconcileWallet(w.organization_id);
      if (!recon.isBalanced) {
        discrepancies.push({
          type: 'CHARGE_WITHOUT_LEDGER',
          entityId: w.id,
          details: `Wallet balance (${recon.walletBalanceMinor}p) differs from ledger sum (${recon.ledgerSumMinor}p) by ${recon.differenceMinor}p`,
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      discrepancies,
      totalChecked: unbilledCalls.length + unchargedEvents.length + wallets.length,
      discrepancyCount: discrepancies.length,
    };
  }

  /**
   * Export billing data as CSV (Section 102)
   */
  async exportBillingCSV(
    organizationId: string,
    type: 'payments' | 'usage' | 'invoices'
  ): Promise<string> {
    const db = await ensureDatabaseReady();

    if (type === 'payments') {
      const payments = await db.query<{
        id: string;
        razorpay_payment_id: string;
        amount_minor: number;
        currency: string;
        status: string;
        method: string;
        created_at: string;
      }>(`
        SELECT id, razorpay_payment_id, amount_minor, currency, status, method, created_at
        FROM billing_payments
        WHERE organization_id = $1
        ORDER BY created_at DESC;
      `, [organizationId]);

      const headers = ['Payment ID', 'Provider Reference', 'Amount (INR)', 'Status', 'Method', 'Date'];
      const rows = payments.map((p) => [
        p.id,
        p.razorpay_payment_id,
        (p.amount_minor / 100).toFixed(2),
        p.status,
        p.method,
        p.created_at,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    if (type === 'usage') {
      const charges = await usageChargeRepository.listByOrganization(organizationId, 1000);
      const headers = ['Charge ID', 'Usage Event ID', 'Billable Minutes', 'Rate (INR/min)', 'Subtotal', 'Tax', 'Total (INR)', 'Date'];
      const rows = charges.charges.map((c) => [
        c.id,
        c.usage_event_id,
        c.quantity,
        (c.unit_price_minor / 100).toFixed(2),
        (c.subtotal_minor / 100).toFixed(2),
        (c.tax_minor / 100).toFixed(2),
        (c.total_minor / 100).toFixed(2),
        c.created_at,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    // Invoices CSV
    const invoices = await billingInvoiceRepository.listByOrganization(organizationId, 1000);
    const headers = ['Invoice Number', 'Issue Date', 'Subtotal (INR)', 'Tax (INR)', 'Total (INR)', 'Status', 'Paid At'];
    const rows = invoices.invoices.map((inv) => [
      inv.invoice_number,
      inv.issue_date,
      (inv.subtotal_minor / 100).toFixed(2),
      (inv.tax_minor / 100).toFixed(2),
      (inv.total_minor / 100).toFixed(2),
      inv.status,
      inv.paid_at || '',
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const billingService = new BillingService();
