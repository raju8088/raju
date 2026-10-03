import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { saveVersionSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_VIEW');

    const versions = await agentService.listVersions(ctx.organizationId, id);
    return successResponse(versions);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', (error as Error).message || 'Failed to list versions', 500);
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_MANAGE');

    const body = await req.json().catch(() => ({}));
    const validated = saveVersionSchema.parse(body);

    const version = await agentService.saveVersion(ctx.organizationId, ctx.userId, id, validated.name);
    return successResponse(version, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version details', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('SAVE_VERSION_FAILED', (error as Error).message || 'Failed to save version', 400);
  }
}
