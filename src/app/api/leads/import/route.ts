import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_IMPORT');

    const contentType = req.headers.get('content-type') || '';
    let csvContent = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return errorResponse('VALIDATION_ERROR', 'No CSV file provided', 400);
      }
      csvContent = await file.text();
    } else {
      const body = await req.json();
      csvContent = body.csvContent || '';
    }

    if (!csvContent.trim()) {
      return errorResponse('VALIDATION_ERROR', 'CSV content is empty', 400);
    }

    const result = await leadService.importLeadsFromCSV(ctx.organizationId, csvContent, ctx.userId);
    return successResponse(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to import leads from CSV',
      500
    );
  }
}
