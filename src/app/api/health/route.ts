import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureDatabaseReady } from '@/lib/db/client';

// Safe config summary — NEVER expose real values or credentials
function getProviderStatus() {
  return {
    omnidimension: process.env.OMNIDIM_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
    razorpay:
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
        ? 'CONFIGURED'
        : 'NOT_CONFIGURED',
    meta:
      process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID
        ? 'CONFIGURED'
        : 'NOT_CONFIGURED',
  };
}

function sanitizeError(msg: string): string {
  return msg
    .replace(/(password|pass|secret)=[^&\s]+/gi, '$1=[REDACTED]')
    .replace(/(:[^:@\s]+)@[\w.-]+/g, ':[REDACTED]@')
    .replace(/\[REDACTED_SECRET\]/gi, '[REDACTED]')
    .replace(/with password\s+[^\s]+/gi, 'with password [REDACTED]');
}

// GET /api/health — Combined liveness + readiness check
// Supports optional ?mode=live for a quick liveness-only probe
export async function GET(req?: NextRequest) {
  const mode = req?.url
    ? new URL(req.url).searchParams.get('mode') || 'full'
    : 'full';

  // ─── Liveness probe ────────────────────────────────────────────────────────
  if (mode === 'live') {
    return NextResponse.json({
      status: 'alive',
      service: 'voicenuvo',
      version: process.env.APP_VERSION || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Full readiness check ──────────────────────────────────────────────────
  try {
    const driver = await ensureDatabaseReady();
    const rows = await driver.query<{ alive: number }>('SELECT 1 as alive;');
    const isDbAlive = rows.length > 0 && rows[0].alive === 1;

    return successResponse({
      status: 'healthy',
      service: 'voicenuvo',
      phase: '2.2-remote-postgres-verification',
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: isDbAlive,
        driver: driver.type,
      },
      providers: getProviderStatus(),
      seedSafety: {
        seedDemoData: process.env.SEED_DEMO_DATA === 'true',
        safe: process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_DATA !== 'true',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const isProd = process.env.NODE_ENV === 'production';
    const rawError = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(
      'DATABASE_UNHEALTHY',
      'Database connection probe failed',
      503,
      {
        connected: false,
        driver: process.env.DATABASE_URL ? 'postgres' : 'pglite',
        detail: isProd ? 'Database service is currently unreachable' : sanitizeError(rawError),
      }
    );
  }
}
