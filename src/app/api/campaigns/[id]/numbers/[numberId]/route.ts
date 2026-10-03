import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { campaignService } from '@/services/campaign.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; numberId: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_MANAGE');

    const { id, numberId } = await params;
    const body = await req.json();
    const isActive = Boolean(body.isActive !== false);

    const success = await campaignService.setNumberActive(
      ctx.organizationId,
      id,
      numberId,
      isActive
    );

    return successResponse({ success, isActive });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'UPDATE_NUMBER_STATUS_FAILED',
      (error as Error).message || 'Failed to update number status',
      400
    );
  }
}
