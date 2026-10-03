import { NextRequest, NextResponse } from 'next/server';
import { metaIntegrationRepository } from '@/lib/db/repositories/meta-integration.repository';
import { metaIntegrationService } from '@/services/meta-integration.service';
import { metaLeadProvider } from '@/lib/providers/meta/meta-lead.provider';
import { externalLeadEventRepository } from '@/lib/db/repositories/external-lead-event.repository';
import { leadService } from '@/services/lead.service';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/webhooks/meta/leadgen
 * Handles Meta Webhook Verification Handshake
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  const expectedToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN || 'voicenuvo_meta_verify_token_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    logger.info('meta.webhook_verified', {
      action: 'META_WEBHOOK_VERIFY',
      metadata: { challenge },
    });
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  logger.warn('meta.webhook_verify_mismatch', {
    action: 'META_WEBHOOK_VERIFY',
    metadata: { tokenProvided: token },
  });

  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST /api/webhooks/meta/leadgen
 * Receives and processes Meta Lead Ads inbound events
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    // 1. Signature Verification
    if (process.env.META_APP_SECRET) {
      const isValid = metaLeadProvider.verifyWebhookSignature(
        rawBody,
        signature,
        process.env.META_APP_SECRET
      );
      if (!isValid) {
        logger.warn('meta.webhook_invalid_signature', {
          action: 'META_WEBHOOK_SIGNATURE_FAIL',
        });
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    interface WebhookEntryChange {
      field: string;
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        campaign_id?: string;
        created_time?: number;
      };
    }

    interface WebhookEntry {
      id: string;
      time?: number;
      changes?: WebhookEntryChange[];
    }

    interface MetaWebhookPayload {
      object?: string;
      entry?: WebhookEntry[];
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MetaWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (payload.object !== 'page' || !Array.isArray(payload.entry)) {
      return NextResponse.json({ received: true, ignored: 'Not a page event' }, { status: 200 });
    }

    let processedCount = 0;
    let duplicateCount = 0;

    for (const entry of payload.entry) {
      const pageId = String(entry.id);
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const val = change.value || {};
        const leadgenId = String(val.leadgen_id || '');
        if (!leadgenId) continue;

        // Find tenant owning this page
        const integration = await metaIntegrationRepository.findByPageIdGlobal(pageId);
        if (!integration) {
          logger.warn('meta.webhook_page_unassociated', {
            action: 'META_WEBHOOK_UNASSOCIATED',
            metadata: { pageId, leadgenId },
          });
          continue;
        }

        const orgId = integration.organization_id;

        // Idempotency check: Has this webhook event already been processed?
        const existingEvent = await externalLeadEventRepository.findByProviderEventId(
          orgId,
          'META',
          leadgenId
        );

        if (existingEvent && (existingEvent.processing_status === 'PROCESSED' || existingEvent.processing_status === 'DUPLICATE')) {
          logger.info('meta.webhook_duplicate_ignored', {
            action: 'META_WEBHOOK_IDEMPOTENT',
            metadata: { leadgenId, orgId },
          });
          duplicateCount++;
          continue;
        }

        // Decrypt access token
        const pageAccessToken = metaIntegrationService.getDecryptedAccessToken(integration);

        // Fetch lead details from Meta Graph API
        let metaLeadDetails;
        try {
          metaLeadDetails = await metaLeadProvider.fetchLeadDetails(leadgenId, pageAccessToken);
        } catch (fetchErr) {
          logger.error('meta.webhook_retrieval_failed', {
            action: 'META_LEAD_RETRIEVAL_FAILED',
            metadata: { leadgenId, orgId },
            errorMessage: (fetchErr as Error).message,
          });

          // Mark event as RETRY_PENDING so it is not lost
          await externalLeadEventRepository.create({
            organizationId: orgId,
            provider: 'META',
            providerEventId: leadgenId,
            processingStatus: 'RETRY_PENDING',
            errorMessageSafe: (fetchErr as Error).message,
          });
          continue;
        }

        // Normalize lead
        const normalized = metaLeadProvider.normalizeLead(metaLeadDetails);

        // Auto-call config from integration settings
        const autoCallConfig = integration.auto_call_enabled && integration.auto_call_agent_id
          ? {
              enabled: true,
              agentId: integration.auto_call_agent_id,
              phoneNumberId: integration.auto_call_phone_number_id || undefined,
            }
          : undefined;

        // Ingest into CRM
        await leadService.ingestLead(orgId, {
          contact: {
            firstName: normalized.firstName,
            lastName: normalized.lastName,
            fullName: normalized.fullName,
            phone: normalized.phone,
            email: normalized.email,
            company: normalized.company,
            city: normalized.city,
            state: normalized.state,
            country: normalized.country,
            customFields: normalized.customFields,
          },
          lead: {
            title: `${normalized.fullName} (Meta Lead Ad)`,
            status: 'NEW',
            stage: 'NEW',
            priority: 'HIGH',
            externalId: leadgenId,
            externalPlatform: 'META',
            externalFormId: normalized.attribution.formId || val.form_id,
            externalAdId: normalized.attribution.adId || val.ad_id,
            externalCampaignId: normalized.attribution.campaignId,
            utmSource: normalized.attribution.utmSource,
            utmMedium: normalized.attribution.utmMedium,
            utmCampaign: normalized.attribution.utmCampaign,
            rawAttribution: normalized.attribution as Record<string, unknown>,
            customFields: normalized.customFields,
          },
          sourceType: 'META_LEAD_AD',
          sourceName: 'Meta Lead Ads',
          providerEventId: leadgenId,
          autoCallOverride: autoCallConfig,
        });

        processedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      duplicates: duplicateCount,
    });
  } catch (error) {
    logger.error('meta.webhook_unhandled_error', {
      action: 'META_WEBHOOK_ERROR',
      errorMessage: (error as Error).message,
    });
    return NextResponse.json(
      { error: (error as Error).message || 'Webhook processing error' },
      { status: 500 }
    );
  }
}
