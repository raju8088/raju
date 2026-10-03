import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/services/payment.service';
import { logger } from '@/lib/utils/logger';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      logger.warn('webhook.missing_signature', { action: 'RAZORPAY_WEBHOOK' });
      return NextResponse.json(
        { error: 'Missing x-razorpay-signature header' },
        { status: 400 }
      );
    }

    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json(
        { error: 'Empty webhook payload' },
        { status: 400 }
      );
    }

    const result = await paymentService.handleWebhookEvent(rawBody, signature);
    return NextResponse.json({ status: 'ok', result }, { status: 200 });
  } catch (err) {
    logger.error('webhook.processing_error', {
      action: 'RAZORPAY_WEBHOOK_ERROR',
      errorMessage: (err as Error).message,
    });
    return NextResponse.json(
      { error: (err as Error).message || 'Webhook processing failed' },
      { status: 400 }
    );
  }
}
