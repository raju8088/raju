import { ensureDatabaseReady } from '@/lib/db/client';
import { subscriptionRepository } from '@/lib/db/repositories/subscription.repository';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { walletService } from './wallet.service';
import { EntitlementLimits } from '@/types/billing';

export class EntitlementError extends Error {
  public code: string;
  constructor(message: string, code = 'ENTITLEMENT_EXCEEDED') {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}

export class EntitlementService {
  async getEntitlements(organizationId: string): Promise<EntitlementLimits> {
    const db = await ensureDatabaseReady();

    // 1. Resolve Subscription & Plan
    const subscription = await subscriptionRepository.findByOrganizationId(organizationId);
    let plan = subscription?.plan_id
      ? await billingPlanRepository.findById(subscription.plan_id)
      : null;

    // Fallback to Starter plan if no subscription configured
    if (!plan) {
      plan = await billingPlanRepository.findByCode('STARTER');
    }

    const maxUsers = plan?.max_users ?? 3;
    const maxAgents = plan?.max_agents ?? 2;
    const maxCampaigns = plan?.max_campaigns ?? 5;

    // 2. Count active resources
    const [userRes, agentRes, campaignRes] = await Promise.all([
      db.queryOne<{ count: string | number }>(
        `SELECT COUNT(*) as count FROM organization_members WHERE organization_id = $1;`,
        [organizationId]
      ),
      db.queryOne<{ count: string | number }>(
        `SELECT COUNT(*) as count FROM voice_agents WHERE organization_id = $1 AND status != 'DELETED';`,
        [organizationId]
      ),
      db.queryOne<{ count: string | number }>(
        `SELECT COUNT(*) as count FROM campaigns WHERE organization_id = $1 AND status != 'CANCELLED';`,
        [organizationId]
      ),
    ]);

    const currentUsers = Number(userRes?.count || 0);
    const currentAgents = Number(agentRes?.count || 0);
    const currentCampaigns = Number(campaignRes?.count || 0);

    // 3. Resolve wallet balance and included minutes
    const wallet = await walletService.getWallet(organizationId);
    const includedMinutesTotal = plan?.included_minutes ?? 500;

    // Sum usage this month for included minutes
    const now = new Date();
    const usageRes = await db.queryOne<{ total_minutes: string | number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total_minutes
       FROM usage_charges
       WHERE organization_id = $1
         AND EXTRACT(YEAR FROM created_at) = $2
         AND EXTRACT(MONTH FROM created_at) = $3;`,
      [organizationId, now.getUTCFullYear(), now.getUTCMonth() + 1]
    );

    const usedMinutes = Number(usageRes?.total_minutes || 0);
    const includedMinutesRemaining = Math.max(0, includedMinutesTotal - usedMinutes);

    // Check subscription active state
    const subStatus = subscription?.status || 'TRIAL';
    const isSubActive = subStatus === 'ACTIVE' || subStatus === 'TRIAL';

    // A call can be dispatched if subscription is active and (included minutes remain OR wallet balance >= ₹7.00/700 paise)
    const canDispatchCall =
      isSubActive && (includedMinutesRemaining > 0 || wallet.balance_minor >= 700);

    let reason: string | undefined;
    if (!isSubActive) {
      reason = `Subscription is ${subStatus}. Please update your billing plan.`;
    } else if (!canDispatchCall) {
      reason = `Insufficient balance. Please add credits to your wallet (minimum ₹7 required).`;
    }

    return {
      canCreateUser: currentUsers < maxUsers,
      canCreateAgent: currentAgents < maxAgents,
      canCreateCampaign: currentCampaigns < maxCampaigns,
      canDispatchCall,
      maxUsers,
      currentUsers,
      maxAgents,
      currentAgents,
      maxCampaigns,
      currentCampaigns,
      walletBalanceMinor: wallet.balance_minor,
      includedMinutesRemaining,
      reason,
    };
  }

  async assertCanCreateAgent(organizationId: string): Promise<void> {
    const entitlements = await this.getEntitlements(organizationId);
    if (!entitlements.canCreateAgent) {
      throw new EntitlementError(
        `Agent creation limit reached (${entitlements.currentAgents}/${entitlements.maxAgents}). Please upgrade your plan.`,
        'LIMIT_AGENTS_EXCEEDED'
      );
    }
  }

  async assertCanCreateCampaign(organizationId: string): Promise<void> {
    const entitlements = await this.getEntitlements(organizationId);
    if (!entitlements.canCreateCampaign) {
      throw new EntitlementError(
        `Campaign limit reached (${entitlements.currentCampaigns}/${entitlements.maxCampaigns}). Please upgrade your plan.`,
        'LIMIT_CAMPAIGNS_EXCEEDED'
      );
    }
  }

  async assertCanDispatchCall(organizationId: string): Promise<void> {
    const entitlements = await this.getEntitlements(organizationId);
    if (!entitlements.canDispatchCall) {
      throw new EntitlementError(
        entitlements.reason || 'Cannot dispatch call: insufficient wallet credits or inactive subscription.',
        'INSUFFICIENT_CREDITS'
      );
    }
  }

  async assertCanCreateUser(organizationId: string): Promise<void> {
    const entitlements = await this.getEntitlements(organizationId);
    if (!entitlements.canCreateUser) {
      throw new EntitlementError(
        `User seat limit reached (${entitlements.currentUsers}/${entitlements.maxUsers}). Please upgrade your plan.`,
        'LIMIT_USERS_EXCEEDED'
      );
    }
  }
}

export const entitlementService = new EntitlementService();
