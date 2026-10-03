import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { providerConnectionService } from '@/services/provider-connection.service';
import { saveConnectionSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'VOICE_PROVIDER_MANAGE');

    const status = await providerConnectionService.getConnectionStatus(ctx.organizationId);
    return successResponse(status);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve connection status', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'VOICE_PROVIDER_MANAGE');

    const body = await req.json();
    const validated = saveConnectionSchema.parse(body);

    const saved = await providerConnectionService.saveConnection(
      ctx.organizationId,
      ctx.userId,
      validated.apiKey,
      validated.displayName
    );

    return successResponse(saved);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid connection parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('PROVIDER_CONNECTION_FAILED', (error as Error).message, 400);
  }
}

export async function DELETE() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'VOICE_PROVIDER_MANAGE');

    const success = await providerConnectionService.disconnect(ctx.organizationId, ctx.userId);
    return successResponse({ disconnected: success });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to disconnect provider', 500);
  }
}
