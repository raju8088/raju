import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { organizationService, OrganizationError } from '@/services/organization.service';
import { suspendOrganizationSchema } from '@/lib/validation/organization.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await req.json();
    const validated = suspendOrganizationSchema.parse(body);

    const suspended = await organizationService.suspend(id, validated.status, ctx);
    return successResponse(suspended);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid status payload', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof OrganizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to suspend organization', 500);
  }
}
