import { NextRequest } from 'next/server';
import { leadService } from '@/services/lead.service';
import { leadSourceService } from '@/services/lead-source.service';
import { inboundLeadSchema } from '@/lib/validation/crm.schema';
import { rateLimitRepository } from '@/lib/db/repositories/rate-limit.repository';
import { organizationRepository } from '@/lib/db/repositories/organization.repository';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve Target Organization
    // Can be supplied via header 'x-organization-id' or query param 'org' or bearer token
    const orgId =
      req.headers.get('x-organization-id') ||
      req.nextUrl.searchParams.get('org') ||
      req.nextUrl.searchParams.get('organizationId');

    if (!orgId) {
      return errorResponse(
        'INVALID_REQUEST',
        'Organization identifier required (via x-organization-id header or ?org= parameter)',
        400
      );
    }

    const org = await organizationRepository.findById(orgId);
    if (!org || org.status !== 'ACTIVE') {
      return errorResponse('NOT_FOUND', 'Active organization not found', 404);
    }

    // 2. Abuse Protection / Rate Limiting (60 submissions per hour per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rateLimitKey = `inbound_leads:${orgId}:${ip}`;
    const rateCheck = await rateLimitRepository.checkAndConsume(rateLimitKey, 60, 3600);
    if (!rateCheck.allowed) {
      return errorResponse(
        'RATE_LIMITED',
        'Inbound form submission rate limit exceeded. Please try again later.',
        429
      );
    }

    // 3. Payload Validation
    const body = await req.json();
    const validated = inboundLeadSchema.parse(body);

    if (!validated.phone && !validated.email) {
      return errorResponse('VALIDATION_ERROR', 'At least phone or email is required', 400);
    }

    // 4. Resolve source config (checks if auto-call is configured for website leads)
    const websiteSource = await leadSourceService.getSourceByType(orgId, 'WEBSITE');
    const autoCallConfig = websiteSource?.config?.auto_call_enabled
      ? {
          enabled: true,
          agentId: websiteSource.config.auto_call_agent_id as string,
          phoneNumberId: websiteSource.config.auto_call_phone_number_id as string,
        }
      : undefined;

    // 5. Ingest lead
    const result = await leadService.ingestLead(orgId, {
      contact: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        fullName: validated.fullName,
        phone: validated.phone,
        email: validated.email,
        company: validated.company,
        city: validated.city,
        state: validated.state,
        country: validated.country,
        customFields: validated.customFields,
      },
      lead: {
        title: `${validated.fullName || validated.email || validated.phone} (${validated.sourceName})`,
        status: 'NEW',
        stage: 'NEW',
        priority: 'MEDIUM',
        utmSource: validated.utm_source,
        utmMedium: validated.utm_medium,
        utmCampaign: validated.utm_campaign,
        utmTerm: validated.utm_term,
        utmContent: validated.utm_content,
        externalFormId: validated.formId,
        customFields: validated.customFields,
      },
      sourceType: 'WEBSITE',
      sourceId: websiteSource?.id,
      sourceName: validated.sourceName,
      autoCallOverride: autoCallConfig,
    });

    return successResponse(
      {
        message: 'Lead received successfully',
        leadId: result.lead.id,
        isDuplicate: result.isDuplicate,
      },
      201
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('VALIDATION_ERROR', 'Invalid form submission data', 400, error.format());
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      (error as Error).message || 'Failed to process inbound lead submission',
      500
    );
  }
}
