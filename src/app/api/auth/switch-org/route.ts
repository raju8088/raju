import { NextRequest } from 'next/server';
import { getOrganizationContext, setSessionCookie } from '@/lib/auth/session';
import { authService, AuthError } from '@/services/auth.service';
import { switchOrgSchema } from '@/lib/validation/auth.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const body = await req.json();
    const validated = switchOrgSchema.parse(body);

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      undefined;

    const result = await authService.switchOrganization(ctx.userId, validated.organization_id, ipAddress);

    await setSessionCookie({
      userId: ctx.userId,
      currentOrgId: result.organization.id,
      role: result.role,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return successResponse({
      organization: result.organization,
      role: result.role,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid switch organization payload', 400, error.format());
    }
    if (error instanceof AuthError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to switch organization', 500);
  }
}
