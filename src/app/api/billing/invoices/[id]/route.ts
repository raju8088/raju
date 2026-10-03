import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingService } from '@/services/billing.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_VIEW');

    const { id } = await params;
    const invoice = await billingService.getInvoice(id, ctx.organizationId);
    if (!invoice) {
      return errorResponse('NOT_FOUND', 'Invoice not found', 404);
    }

    return successResponse(invoice);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch invoice',
      500
    );
  }
}
