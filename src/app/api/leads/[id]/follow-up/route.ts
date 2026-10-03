import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { scheduleFollowUpSchema } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_MANAGE');

    const { id } = await params;
    const body = await req.json();
    const { followUpAt } = scheduleFollowUpSchema.parse(body);

    const updated = await leadService.scheduleFollowUp(id, ctx.organizationId, followUpAt, ctx.userId);
    if (!updated) {
      return errorResponse('NOT_FOUND', 'Lead not found', 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid follow-up date/time', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to schedule follow-up',
      500
    );
  }
}
