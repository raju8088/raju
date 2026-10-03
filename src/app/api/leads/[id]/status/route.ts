import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { leadStatusEnum } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { z, ZodError } from 'zod';

const updateStatusBodySchema = z.object({
  status: leadStatusEnum,
});

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
    const { status } = updateStatusBodySchema.parse(body);

    const updated = await leadService.updateLead(id, ctx.organizationId, { status }, ctx.userId);
    if (!updated) {
      return errorResponse('NOT_FOUND', 'Lead not found', 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid status value', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to update lead status',
      500
    );
  }
}
