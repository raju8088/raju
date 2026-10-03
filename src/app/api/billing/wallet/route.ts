import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { walletService } from '@/services/wallet.service';
import { updateWalletSettingsSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_VIEW');

    const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');

    const [wallet, ledger] = await Promise.all([
      walletService.getWallet(ctx.organizationId),
      walletService.getLedger(ctx.organizationId, limit, offset),
    ]);

    return successResponse({
      wallet,
      ledger: ledger.entries,
      totalEntries: ledger.total,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch wallet',
      500
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_MANAGE');

    const body = await req.json();
    const validated = updateWalletSettingsSchema.parse(body);

    const updated = await walletService.updateSettings(ctx.organizationId, validated);
    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid wallet settings', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to update wallet settings',
      500
    );
  }
}
