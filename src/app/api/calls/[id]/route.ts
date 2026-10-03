import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { callService } from '@/services/call.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CALL_VIEW');

    const { id } = await params;
    const refresh = req.nextUrl.searchParams.get('refresh') === 'true';

    const call = await callService.getCall(ctx.organizationId, id, ctx.userId, { refresh });
    return successResponse(call);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'NOT_FOUND',
      (error as Error).message || 'Call record not found',
      404
    );
  }
}
