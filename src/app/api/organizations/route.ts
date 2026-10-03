import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { organizationService, OrganizationError } from '@/services/organization.service';
import { createOrganizationSchema } from '@/lib/validation/organization.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const orgs = await organizationService.list(ctx);
    return successResponse(orgs);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof OrganizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve organizations', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await req.json();
    const validated = createOrganizationSchema.parse(body);

    const org = await organizationService.create(validated, ctx);
    return successResponse(org, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid organization data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof OrganizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create organization', 500);
  }
}
