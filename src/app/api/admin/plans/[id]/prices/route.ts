import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { createPlanPriceSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_VIEW');

    const { id } = await params;
    const prices = await billingPlanRepository.listPrices(id);
    return successResponse(prices);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list plan prices',
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_MANAGE');

    if (ctx.role !== 'MAIN_ADMIN') {
      return errorResponse('FORBIDDEN', 'Only MAIN_ADMIN can version prices', 403);
    }

    const { id } = await params;
    const body = await req.json();
    const validated = createPlanPriceSchema.parse(body);

    const planPrice = await billingPlanRepository.createPrice({
      plan_id: id,
      billing_interval: validated.billing_interval,
      price_minor: validated.price_minor,
    });

    return successResponse(planPrice, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid plan price data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create versioned plan price',
      500
    );
  }
}
