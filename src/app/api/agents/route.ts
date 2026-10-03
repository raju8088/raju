import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { agentService } from '@/services/agent.service';
import { createAgentSchema } from '@/lib/validation/voice';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_VIEW');

    const agents = await agentService.listAgents(ctx.organizationId);
    return successResponse(agents);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', (error as Error).message || 'Failed to list agents', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'AGENT_MANAGE');

    const body = await req.json();
    const validated = createAgentSchema.parse(body);

    const created = await agentService.createAgent(ctx.organizationId, ctx.userId, validated);
    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid agent configuration', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('AGENT_CREATE_FAILED', (error as Error).message || 'Failed to create agent', 400);
  }
}
