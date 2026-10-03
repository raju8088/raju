import { NextRequest } from 'next/server';
import { callService } from '@/services/call.service';
import { callWebhookSchema } from '@/lib/validation/call.schema';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { logger } from '@/lib/utils/logger';

export async function POST(req: NextRequest) {
  try {
    // 1. Webhook security verification if secret configured
    const configuredSecret = process.env.OMNIDIM_WEBHOOK_SECRET;
    if (configuredSecret) {
      const headerSecret = req.headers.get('x-webhook-secret') || req.headers.get('x-omnidimension-signature');
      const querySecret = req.nextUrl.searchParams.get('secret');
      const providedSecret = headerSecret || querySecret;

      if (!providedSecret || providedSecret !== configuredSecret) {
        logger.warn('webhook.unauthorized_attempt', {
          request: { ip: req.headers.get('x-forwarded-for') || 'unknown' },
        });
        return errorResponse('UNAUTHORIZED', 'Invalid webhook verification secret', 401);
      }
    }

    // 2. Read body with length check (max 2MB)
    const rawBody = await req.json();
    const validated = callWebhookSchema.parse(rawBody);

    // 3. Process webhook idempotently
    const result = await callService.processWebhook(validated);

    return successResponse({
      received: true,
      matched: result.matched,
      callId: result.callId,
      status: result.status,
      reason: result.reason,
    });
  } catch (error) {
    logger.error('webhook.processing_error', {
      errorMessage: (error as Error).message,
    });
    return errorResponse(
      'WEBHOOK_PROCESSING_FAILED',
      (error as Error).message || 'Failed to process post-call webhook',
      400
    );
  }
}
