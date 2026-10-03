import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { listLeadsQuerySchema } from '@/lib/validation/crm.schema';
import { errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_EXPORT');

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = listLeadsQuerySchema.parse(searchParams);

    const csvData = await leadService.exportLeadsToCSV(ctx.organizationId, {
      status: query.status,
      stage: query.stage,
      sourceId: query.sourceId,
      sourceType: query.sourceType,
      assignedUserId: query.assignedUserId,
      assignedAgentId: query.assignedAgentId,
      priority: query.priority,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid query parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to export leads',
      500
    );
  }
}
