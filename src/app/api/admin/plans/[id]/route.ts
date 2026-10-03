import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_MANAGE');

    if (ctx.role !== 'MAIN_ADMIN') {
      return errorResponse('FORBIDDEN', 'Only MAIN_ADMIN can update plans', 403);
    }

    const { id } = await params;
    const body = await req.json();

    const updated = await billingPlanRepository.update(id, body);
    if (!updated) {
      return errorResponse('NOT_FOUND', 'Plan not found', 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to update plan',
      500
    );
  }
}
