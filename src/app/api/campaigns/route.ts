import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { campaignService } from '@/services/campaign.service';
import { listCampaignsQuerySchema } from '@/lib/validation/campaign.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_VIEW');

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = listCampaignsQuerySchema.parse(searchParams);

    const offset = (query.page - 1) * query.limit;
    const result = await campaignService.listCampaigns(ctx.organizationId, {
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset,
    });

    const totalPages = Math.ceil(result.total / query.limit) || 1;

    return successResponse({
      campaigns: result.campaigns,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid query parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list campaigns',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_CREATE');

    const body = await req.json();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const campaign = await campaignService.createCampaign(
      ctx.organizationId,
      ctx.userId,
      body,
      clientIp
    );

    return successResponse(campaign, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid campaign parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CAMPAIGN_CREATE_FAILED',
      (error as Error).message || 'Failed to create campaign',
      400
    );
  }
}
