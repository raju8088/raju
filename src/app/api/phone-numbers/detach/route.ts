import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { phoneNumberService } from '@/services/phone-number.service';
import { detachPhoneNumberSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PHONE_NUMBER_MANAGE');

    const body = await req.json();
    const validated = detachPhoneNumberSchema.parse(body);

    const res = await phoneNumberService.detachFromAgent(ctx.organizationId, ctx.userId, validated.phoneId);
    return successResponse(res);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid detachment parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('DETACH_FAILED', (error as Error).message || 'Failed to detach phone number from agent', 400);
  }
}
