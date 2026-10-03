import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { z } from 'zod';

const renameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; versionNumber: string }> }
) {
  try {
    const { id, versionNumber } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_MANAGE');

    const vNum = parseInt(versionNumber, 10);
    if (isNaN(vNum)) return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400);

    const body = await req.json();
    const validated = renameSchema.parse(body);

    const res = await agentService.renameVersion(ctx.organizationId, id, vNum, validated.name);
    return successResponse(res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version name', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('RENAME_FAILED', (error as Error).message || 'Failed to rename version', 400);
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; versionNumber: string }> }
) {
  try {
    const { id, versionNumber } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_MANAGE');

    const vNum = parseInt(versionNumber, 10);
    if (isNaN(vNum)) return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400);

    const res = await agentService.deleteVersion(ctx.organizationId, id, vNum);
    return successResponse(res);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('DELETE_FAILED', (error as Error).message || 'Failed to delete version', 400);
  }
}
