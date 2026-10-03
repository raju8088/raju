import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { metaIntegrationService } from '@/services/meta-integration.service';
import { connectMetaSchema } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { z, ZodError } from 'zod';

const updateMetaSettingsSchema = z.object({
  id: z.string().uuid(),
  autoCallEnabled: z.boolean().optional(),
  autoCallAgentId: z.string().uuid().optional().nullable(),
  autoCallPhoneNumberId: z.string().uuid().optional().nullable(),
});

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'INTEGRATION_MANAGE');

    const integration = await metaIntegrationService.getActiveIntegration(ctx.organizationId);
    return successResponse(integration);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to fetch Meta integration',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'INTEGRATION_MANAGE');

    const body = await req.json();
    const validated = connectMetaSchema.parse(body);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const result = await metaIntegrationService.connectMeta(
      ctx.organizationId,
      ctx.userId,
      {
        pageId: validated.pageId,
        pageAccessToken: validated.pageAccessToken,
        pageName: validated.pageName,
        businessId: validated.businessId,
        adAccountId: validated.adAccountId,
        autoCallEnabled: validated.autoCallEnabled,
        autoCallAgentId: validated.autoCallAgentId,
        autoCallPhoneNumberId: validated.autoCallPhoneNumberId,
      },
      ip
    );

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid Meta connection payload', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'META_CONNECTION_FAILED',
      (error as Error).message || 'Failed to connect Meta account',
      500
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'INTEGRATION_MANAGE');

    const body = await req.json();
    const validated = updateMetaSettingsSchema.parse(body);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const result = await metaIntegrationService.updateIntegrationSettings(
      validated.id,
      ctx.organizationId,
      ctx.userId,
      {
        autoCallEnabled: validated.autoCallEnabled,
        autoCallAgentId: validated.autoCallAgentId,
        autoCallPhoneNumberId: validated.autoCallPhoneNumberId,
      },
      ip
    );

    if (!result) {
      return errorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    return successResponse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid update parameters', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to update Meta settings',
      500
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'INTEGRATION_MANAGE');

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Integration ID is required', 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const success = await metaIntegrationService.disconnectMeta(id, ctx.organizationId, ctx.userId, ip);
    if (!success) {
      return errorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    return successResponse({ disconnected: true, id });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to disconnect Meta integration',
      500
    );
  }
}
