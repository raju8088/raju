import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { organizationService, OrganizationError } from '@/services/organization.service';
import { updateOrganizationSchema } from '@/lib/validation/organization.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const org = await organizationService.getById(id, ctx);
    return successResponse(org);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof OrganizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve organization', 500);
  }
}

export async function PATCH(
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
    const validated = updateOrganizationSchema.parse(body);

    const updated = await organizationService.update(id, validated, ctx);
    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid update data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof OrganizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update organization', 500);
  }
}
