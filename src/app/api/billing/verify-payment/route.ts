import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { paymentService } from '@/services/payment.service';
import { verifyPaymentSchema } from '@/lib/validation/billing.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'BILLING_PAY');

    const body = await req.json();
    const validated = verifyPaymentSchema.parse(body);

    const res = await paymentService.verifyAndCapturePayment(ctx.organizationId, {
      orderId: validated.orderId,
      razorpayOrderId: validated.razorpayOrderId,
      razorpayPaymentId: validated.razorpayPaymentId,
      razorpaySignature: validated.razorpaySignature,
      userId: ctx.userId,
    });

    return successResponse(res);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid payment verification parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'PAYMENT_VERIFICATION_FAILED',
      (error as Error).message || 'Failed to verify payment',
      400
    );
  }
}
