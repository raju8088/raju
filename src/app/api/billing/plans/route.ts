import { getOrganizationContext } from '@/lib/auth/session';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_VIEW');

    const plans = await billingPlanRepository.listPlans('ACTIVE');
    return successResponse(plans);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list plans',
      500
    );
  }
}
