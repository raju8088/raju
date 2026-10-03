import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { assignLeadSchema } from '@/lib/validation/crm.schema';
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
    requirePermission(ctx, 'LEAD_ASSIGN');

    const { id } = await params;
    const body = await req.json();
    const validated = assignLeadSchema.parse(body);

    const updated = await leadService.assignLead(
      id,
      ctx.organizationId,
      { userId: validated.userId, agentId: validated.agentId },
      ctx.userId
    );

    if (!updated) {
      return errorResponse('NOT_FOUND', 'Lead not found', 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid assignment payload', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to assign lead',
      500
    );
  }
}
