import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureDatabaseReady } from '@/lib/db/client';

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/(password|pass|secret)=[^&\s]+/gi, '$1=[REDACTED]')
    .replace(/(:[^:@\s]+)@/g, ':[REDACTED]@')
    .replace(/with password\s+[^\s]+/gi, 'with password [REDACTED]')
    .replace(/\[REDACTED_SECRET\]/gi, '[REDACTED]');
}

export async function GET() {
  try {
    const driver = await ensureDatabaseReady();
    const rows = await driver.query<{ alive: number }>('SELECT 1 as alive;');
    const isDbAlive = rows.length > 0 && rows[0].alive === 1;

    return successResponse({
      status: 'healthy',
      service: 'voicenuvo',
      phase: '2.2-remote-postgres-verification',
      database: {
        connected: isDbAlive,
        driver: driver.type,
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
        detail: isProd ? 'Database service is currently unreachable' : sanitizeErrorMessage(rawError),
      }
    );
  }
}
