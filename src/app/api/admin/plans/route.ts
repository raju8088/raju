import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingPlanRepository } from '@/lib/db/repositories/billing-plan.repository';
import { createPlanSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_MANAGE');

    const plans = await billingPlanRepository.listPlans();
    return successResponse(plans);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list plans',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'PLAN_MANAGE');

    if (ctx.role !== 'MAIN_ADMIN') {
      return errorResponse('FORBIDDEN', 'Only MAIN_ADMIN can create plans', 403);
    }

    const body = await req.json();
    const validated = createPlanSchema.parse(body);

    const plan = await billingPlanRepository.create(validated);
    // Create initial versioned prices
    await billingPlanRepository.createPrice({
      plan_id: plan.id,
      billing_interval: 'MONTHLY',
      price_minor: plan.monthly_price_minor,
      currency: plan.currency,
    });
    await billingPlanRepository.createPrice({
      plan_id: plan.id,
      billing_interval: 'YEARLY',
      price_minor: plan.annual_price_minor,
      currency: plan.currency,
    });

    return successResponse(plan, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid plan definition', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create plan',
      500
    );
  }
}
