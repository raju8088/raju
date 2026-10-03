import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_VIEW');

    const kpis = await leadService.getDashboardKPIs(ctx.organizationId);
    return successResponse(kpis);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch lead KPIs',
      500
    );
  }
}
