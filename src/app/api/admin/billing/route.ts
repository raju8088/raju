import { getOrganizationContext } from '@/lib/auth/session';
import { billingService } from '@/services/billing.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_MANAGE'); // Platform Admin level

    if (ctx.role !== 'MAIN_ADMIN') {
      return errorResponse('FORBIDDEN', 'Only MAIN_ADMIN can access platform billing KPIs', 403);
    }

    const kpis = await billingService.getAdminKPIs();
    return successResponse(kpis);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch admin billing KPIs',
      500
    );
  }
}
