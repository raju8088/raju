import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { campaignService } from '@/services/campaign.service';
import { retryCampaignSchema } from '@/lib/validation/campaign.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_RETRY');

    const { id } = await params;
    const body = await req.json();
    const validated = retryCampaignSchema.parse(body);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const result = await campaignService.retryContacts(
      ctx.organizationId,
      id,
      ctx.userId,
      validated,
      clientIp
    );

    return successResponse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid retry parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CAMPAIGN_RETRY_FAILED',
      (error as Error).message || 'Failed to request campaign retry',
      400
    );
  }
}
