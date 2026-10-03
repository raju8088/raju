import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { listLeadsQuerySchema, createLeadSchema } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_VIEW');

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = listLeadsQuerySchema.parse(searchParams);

    const result = await leadService.listLeads(ctx.organizationId, {
      status: query.status,
      stage: query.stage,
      sourceId: query.sourceId,
      sourceType: query.sourceType,
      assignedUserId: query.assignedUserId,
      assignedAgentId: query.assignedAgentId,
      priority: query.priority,
      followUpStatus: query.followUpStatus,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      isArchived: query.isArchived,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid query parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list leads',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_CREATE');

    const body = await req.json();
    const validated = createLeadSchema.parse(body);

    const result = await leadService.ingestLead(ctx.organizationId, {
      contact: validated.contact,
      lead: validated.lead,
      sourceType: validated.lead.sourceType || 'MANUAL',
      sourceId: validated.lead.sourceId,
      sourceName: validated.lead.sourceName,
      actorId: ctx.userId,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid lead input', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create lead',
      500
    );
  }
}
