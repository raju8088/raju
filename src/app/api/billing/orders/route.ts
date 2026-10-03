import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { paymentService } from '@/services/payment.service';
import { createTopUpOrderSchema, createSubscriptionOrderSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_PAY');

    const body = await req.json();
    const purpose = body.purpose || 'WALLET_TOPUP';

    if (purpose === 'WALLET_TOPUP') {
      const validated = createTopUpOrderSchema.parse(body);
      const res = await paymentService.createTopUpOrder(
        ctx.organizationId,
        validated.amountMinor,
        ctx.userId
      );
      return successResponse(res);
    } else if (purpose === 'SUBSCRIPTION') {
      const validated = createSubscriptionOrderSchema.parse(body);
      const res = await paymentService.createSubscriptionOrder(
        ctx.organizationId,
        validated.planId,
        validated.billingInterval,
        ctx.userId
      );
      return successResponse(res);
    }

    return errorResponse('INVALID_PURPOSE', `Unsupported order purpose: ${purpose}`, 400);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid order parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create payment order',
      500
    );
  }
}
