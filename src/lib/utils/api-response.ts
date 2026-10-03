import { NextResponse } from 'next/server';
import { ApiErrorResponse, ApiSuccessResponse } from '@/types';
import { randomUUID } from 'crypto';

// ─── Correlation ID ────────────────────────────────────────────────────────────
// Every API response carries a unique requestId for log correlation.
// This is safe to expose — it is a random identifier with no sensitive content.
export function generateRequestId(): string {
  return randomUUID();
}

// ─── Safe error sanitization ───────────────────────────────────────────────────
// Strip stack traces, filesystem paths, SQL statements, and credentials from
// error messages before they reach the client.
const INTERNAL_PATTERNS = [
  /at .+\(.+\.ts:\d+:\d+\)/g, // TypeScript stack frames
  /at .+\(.+\.js:\d+:\d+\)/g, // JS stack frames
  /C:\\[^\s]+/g, // Windows paths
  /\/[a-z0-9_-]+(\/[a-z0-9_.-]+)+/gi, // Unix paths
  /(password|pass|secret)=[^\s&]+/gi, // Credential params
  /(:[^:@\s]+)@[\w.-]+/g, // DB URL passwords
  /Bearer\s+[a-zA-Z0-9._-]+/g, // Bearer tokens
];

export function sanitizeErrorForClient(message: string): string {
  let clean = message;
  for (const pattern of INTERNAL_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}

// ─── Response builders ─────────────────────────────────────────────────────────

export function successResponse<T>(
  data: T,
  status = 200,
  meta?: Record<string, unknown>
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
      requestId: generateRequestId(),
    },
    { status }
  );
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const isProd = process.env.NODE_ENV === 'production';
  // In production: sanitize the message; in dev: allow full context for debugging
  const safeMessage = isProd ? sanitizeErrorForClient(message) : message;

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: safeMessage,
        // Never include stack traces or internal details in production
        ...(details && !isProd ? { details } : {}),
      },
      requestId: generateRequestId(),
    },
    { status }
  );
}
