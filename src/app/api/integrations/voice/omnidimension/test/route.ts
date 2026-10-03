import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { providerConnectionService } from '@/services/provider-connection.service';
import { testConnectionSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'VOICE_PROVIDER_MANAGE');

    const body = await req.json();
    const validated = testConnectionSchema.parse(body);

    const result = await providerConnectionService.testApiKey(validated.apiKey);
    return successResponse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'API key is required for testing', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('TEST_CONNECTION_FAILED', (error as Error).message, 400);
  }
}
