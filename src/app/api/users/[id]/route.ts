import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { userService, UserError } from '@/services/user.service';
import { updateMemberSchema } from '@/lib/validation/user.schema';
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

    const member = await userService.getMemberById(id, ctx);
    return successResponse(member);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof UserError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve user', 500);
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
    const validated = updateMemberSchema.parse(body);

    const updated = await userService.updateMember(id, validated, ctx);
    return successResponse(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid update data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof UserError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update user', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    await userService.removeMember(id, ctx);
    return successResponse({ message: 'User removed from organization successfully' });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof UserError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to remove user', 500);
  }
}
