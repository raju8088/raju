import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { leadService } from '@/services/lead.service';
import { addNoteSchema } from '@/lib/validation/crm.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { ZodError } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_VIEW');

    const { id } = await params;
    const notes = await leadService.getNotes(id, ctx.organizationId);
    return successResponse(notes);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list lead notes',
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'LEAD_MANAGE');

    const { id } = await params;
    const body = await req.json();
    const validated = addNoteSchema.parse(body);

    const note = await leadService.addNote(id, ctx.organizationId, validated.body, ctx.userId);
    return successResponse(note, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid note content', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create lead note',
      500
    );
  }
}
