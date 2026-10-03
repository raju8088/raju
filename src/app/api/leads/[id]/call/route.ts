import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { callLeadSchema } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CALL_DISPATCH');

    const { id } = await params;
    const body = await req.json();
    const validated = callLeadSchema.parse(body);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const callRecord = await leadService.callLead(
      id,
      ctx.organizationId,
      {
        agentId: validated.agentId,
        fromNumberId: validated.fromNumberId,
      },
      ctx.userId,
      ip
    );

    return successResponse(callRecord, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid call parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CALL_DISPATCH_FAILED',
      (error as Error).message || 'Failed to dispatch call to lead',
      500
    );
  }
}
