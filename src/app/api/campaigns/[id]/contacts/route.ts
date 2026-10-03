import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { campaignService } from '@/services/campaign.service';
import { listContactsQuerySchema, parseAndValidateCsv } from '@/lib/validation/campaign.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';
import { ZodError } from 'zod';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'CAMPAIGN_VIEW');

    const { id } = await params;
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = listContactsQuerySchema.parse(searchParams);

    const offset = (query.page - 1) * query.limit;
    const result = await campaignService.listContacts(ctx.organizationId, id, {
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset,
    });

    const totalPages = Math.ceil(result.total / query.limit) || 1;

    return successResponse({
      contacts: result.contacts,
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
    return errorResponse(
      'CONTACTS_LIST_FAILED',
      (error as Error).message || 'Failed to list campaign contacts',
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
    requirePermission(ctx, 'CAMPAIGN_CREATE');

    const { id } = await params;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const contentType = req.headers.get('content-type') || '';
    let contactsPayload: unknown = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return errorResponse('VALIDATION_ERROR', 'No CSV file provided in upload', 400);
      }
      const csvText = await file.text();
      const parsedCsv = parseAndValidateCsv(csvText);
      contactsPayload = {
        contacts: parsedCsv.accepted.map((c) => ({
          phoneNumber: c.normalizedPhoneNumber,
          customVariables: c.customVariables,
          metadata: c.metadata,
        })),
      };
    } else {
      const body = await req.json();
      if (body.csvText) {
        const parsedCsv = parseAndValidateCsv(body.csvText);
        contactsPayload = {
          contacts: parsedCsv.accepted.map((c) => ({
            phoneNumber: c.normalizedPhoneNumber,
            customVariables: c.customVariables,
            metadata: c.metadata,
          })),
        };
      } else {
        contactsPayload = body;
      }
    }

    const result = await campaignService.addContacts(
      ctx.organizationId,
      id,
      ctx.userId,
      contactsPayload,
      clientIp
    );

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid contacts format', 400, error.format());
    }
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse(
      'CONTACTS_IMPORT_FAILED',
      (error as Error).message || 'Failed to import contacts',
      400
    );
  }
}
