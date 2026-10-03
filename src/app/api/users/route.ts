import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { userService, UserError } from '@/services/user.service';
import { createUserSchema } from '@/lib/validation/user.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const members = await userService.list(ctx);
    return successResponse(members);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof UserError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve users', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await req.json();
    const validated = createUserSchema.parse(body);

    const member = await userService.create(validated, ctx);
    return successResponse(member, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid user data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof UserError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create user', 500);
  }
}
