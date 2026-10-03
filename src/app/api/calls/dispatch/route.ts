import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { callService } from '@/services/call.service';
import { dispatchCallSchema } from '@/lib/validation/call.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CALL_DISPATCH');

    const body = await req.json();
    const validated = dispatchCallSchema.parse(body);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const result = await callService.dispatchCall(
      ctx.organizationId,
      ctx.userId,
      validated,
      clientIp
    );

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid dispatch parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CALL_DISPATCH_FAILED',
      (error as Error).message || 'Failed to dispatch call',
      400
    );
  }
}
