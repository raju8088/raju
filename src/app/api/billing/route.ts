import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { billingService } from '@/services/billing.service';
import { billingCustomerRepository } from '@/lib/db/repositories/billing-customer.repository';
import { updateBillingCustomerSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_VIEW');

    const summary = await billingService.getOrganizationBillingSummary(ctx.organizationId);
    return successResponse(summary);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch billing summary',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_MANAGE');

    const body = await req.json();
    const validated = updateBillingCustomerSchema.parse(body);

    const customer = await billingCustomerRepository.upsert({
      organizationId: ctx.organizationId,
      name: validated.name,
      email: validated.email,
      phone: validated.phone,
      businessLegalName: validated.businessLegalName,
      gstin: validated.gstin,
      isGstRegistered: validated.isGstRegistered,
      placeOfSupply: validated.placeOfSupply,
      billingAddress: validated.billingAddress,
    });

    return successResponse(customer);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid customer billing profile', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to update billing profile',
      500
    );
  }
}
