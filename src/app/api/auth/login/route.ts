import { NextRequest } from 'next/server';
import { authService, AuthError } from '@/services/auth.service';
import { loginSchema } from '@/lib/validation/auth.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { setSessionCookie } from '@/lib/auth/session';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = loginSchema.parse(body);

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      undefined;

    const result = await authService.login(validated, ipAddress);

    // Set HTTP-only secure cookie
    await setSessionCookie({
      userId: result.user.id,
      currentOrgId: result.organization.id,
      role: result.role,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return successResponse({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        phone: result.user.phone,
        status: result.user.status,
      },
      organization: result.organization,
      role: result.role,
      permissions: result.context.permissions,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid login payload', 400, error.format());
    }
    if (error instanceof AuthError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred during login', 500);
  }
}
