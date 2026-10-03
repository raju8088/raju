import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { phoneNumberService } from '@/services/phone-number.service';
import { searchPhoneNumbersSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PHONE_NUMBER_MANAGE');

    const searchParams = req.nextUrl.searchParams;
    const query = searchPhoneNumbersSchema.parse({
      region: searchParams.get('region') || 'US',
      carrier: searchParams.get('carrier') || undefined,
      limit: searchParams.get('limit') || 20,
      page: searchParams.get('page') || 1,
    });

    const numbers = await phoneNumberService.searchAvailable(ctx.organizationId, ctx.userId, query);
    return successResponse(numbers);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid search parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('SEARCH_FAILED', (error as Error).message || 'Failed to search phone numbers', 400);
  }
}
