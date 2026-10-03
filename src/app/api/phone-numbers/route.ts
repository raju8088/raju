import { getOrganizationContext } from '@/lib/auth/session';
import { phoneNumberService } from '@/services/phone-number.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PHONE_NUMBER_VIEW');

    const numbers = await phoneNumberService.listNumbers(ctx.organizationId);
    return successResponse(numbers);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', (error as Error).message || 'Failed to list phone numbers', 500);
  }
}
