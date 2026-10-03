import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function POST() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_VIEW');

    const result = await agentService.syncOrganizationAgents(ctx.organizationId, ctx.userId);
    return successResponse(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'SYNC_FAILED',
      (error as Error).message || 'Failed to synchronize agents from OmniDimension',
      500
    );
  }
}
