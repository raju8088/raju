import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { usageService } from '@/services/usage.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'USAGE_VIEW');

    const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');

    const result = await usageService.listUsageCharges(ctx.organizationId, limit, offset);
    return successResponse(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list usage charges',
      500
    );
  }
}
