import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { contactService } from '@/services/contact.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { z, ZodError } from 'zod';

const createContactSchema = z.object({
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  fullName: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  company: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CONTACT_VIEW');

    const search = req.nextUrl.searchParams.get('search') || undefined;
    const tag = req.nextUrl.searchParams.get('tag') || undefined;
    const limit = Number(req.nextUrl.searchParams.get('limit') || 50);
    const offset = Number(req.nextUrl.searchParams.get('offset') || 0);

    const result = await contactService.listContacts(ctx.organizationId, {
      search,
      tag,
      limit,
      offset,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to list contacts',
      500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CONTACT_MANAGE');

    const body = await req.json();
    const validated = createContactSchema.parse(body);

    const result = await contactService.resolveOrCreateContact(ctx.organizationId, validated);
    return successResponse(result, result.isNew ? 201 : 200);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid contact data', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to create contact',
      500
    );
  }
}
