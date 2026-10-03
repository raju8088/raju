import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string; versionNumber: string }> }
) {
  try {
    const { id, versionNumber } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_MANAGE');

    const vNum = parseInt(versionNumber, 10);
    if (isNaN(vNum)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    const res = await agentService.restoreVersion(ctx.organizationId, ctx.userId, id, vNum);
    return successResponse(res);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('RESTORE_FAILED', (error as Error).message || 'Failed to restore version', 400);
  }
}
