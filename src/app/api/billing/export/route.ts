import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingService } from '@/services/billing.service';
import { errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_EXPORT');

    const typeParam = req.nextUrl.searchParams.get('type') || 'invoices';
    if (!['payments', 'usage', 'invoices'].includes(typeParam)) {
      return errorResponse('INVALID_TYPE', 'Invalid export type. Must be payments, usage, or invoices', 400);
    }

    const type = typeParam as 'payments' | 'usage' | 'invoices';
    const csvData = await billingService.exportBillingCSV(ctx.organizationId, type);

    const filename = `voicenuvo_${type}_${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to export billing CSV',
      500
    );
  }
}
