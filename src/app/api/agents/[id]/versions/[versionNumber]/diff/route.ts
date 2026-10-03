import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string; versionNumber: string }> }
) {
  try {
    const { id, versionNumber } = await props.params;
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_VIEW');

    const vNum = parseInt(versionNumber, 10);
    if (isNaN(vNum)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    const diff = await agentService.diffVersion(ctx.organizationId, id, vNum);
    return successResponse(diff);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('DIFF_FAILED', (error as Error).message || 'Failed to calculate diff', 400);
  }
}
