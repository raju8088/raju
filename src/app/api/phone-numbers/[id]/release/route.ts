import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { phoneNumberService } from '@/services/phone-number.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PHONE_NUMBER_MANAGE');

    const res = await phoneNumberService.releaseNumber(ctx.organizationId, ctx.userId, id);
    return successResponse(res);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('RELEASE_FAILED', (error as Error).message || 'Failed to release phone number', 400);
  }
}
