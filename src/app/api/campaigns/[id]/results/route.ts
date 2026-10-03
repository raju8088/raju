import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { campaignService } from '@/services/campaign.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_VIEW');

    const { id } = await params;
    const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
    const pageSize = req.nextUrl.searchParams.get('limit')
      ? parseInt(req.nextUrl.searchParams.get('limit')!, 10)
      : 50;

    const result = await campaignService.syncResults(ctx.organizationId, id, {
      cursor,
      pageSize,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CAMPAIGN_RESULTS_FAILED',
      (error as Error).message || 'Failed to sync campaign results',
      500
    );
  }
}
