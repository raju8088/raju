export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: string;
  action: string;
  success: boolean;
  correlationId?: string;
  request?: {
    method?: string;
    url?: string;
    ip?: string;
    correlationId?: string;
  };
  user?: {
    id?: string;
    // Note: email is accepted but should be masked before logging (use maskEmail())
    email?: string;
    role?: string;
  };
  organization?: {
    id?: string;
    slug?: string;
  };
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// ─── Sensitive key redaction ───────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'apikey',
  'service_role_key',
  'authorization',
  'cookie',
  'card',
  'credit_card',
  'encryption_key',
  'webhook_secret',
  'session_secret',
  'omnidim_api_key',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'meta_page_access_token',
  'meta_app_secret',
  'database_url',
  'private_key',
]);

// ─── PII masking helpers ───────────────────────────────────────────────────────
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) return '***';
  return `***${phone.slice(-4)}`;
}

function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 8) return '[DEEP_OBJECT]';
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map((v) => sanitize(v, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value, depth + 1);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// ─── Logger ────────────────────────────────────────────────────────────────────
export const logger = {
  info(action: string, data?: Partial<LogEntry>) {
    const entry: LogEntry = {
      level: 'info',
      timestamp: new Date().toISOString(),
      action,
      success: data?.success !== false,
      ...data,
      metadata: data?.metadata
        ? (sanitize(data.metadata) as Record<string, unknown>)
        : undefined,
    };
    console.log(JSON.stringify(entry));
  },

  warn(action: string, data?: Partial<LogEntry>) {
    const entry: LogEntry = {
      level: 'warn',
      timestamp: new Date().toISOString(),
      action,
      success: data?.success ?? false,
      ...data,
      metadata: data?.metadata
        ? (sanitize(data.metadata) as Record<string, unknown>)
        : undefined,
    };
    console.warn(JSON.stringify(entry));
  },

  error(action: string, error: unknown, data?: Partial<LogEntry>) {
    const raw = error instanceof Error ? error.message : String(error);
    // Strip paths, tokens, and stack frames from logged error messages
    const safeMessage = raw
      .replace(/(password|pass|secret)=[^\s&]+/gi, '$1=[REDACTED]')
      .replace(/(:[^:@\s]+)@[\w.-]+/g, ':[REDACTED]@')
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
      .replace(/C:\\[^\s]+/g, '[PATH]')
      .replace(/\/[a-z0-9_-]+(\/[a-z0-9_.-]+){2,}/gi, '[PATH]');

    const errorCode = (error as { code?: string })?.code || 'INTERNAL_ERROR';

    const entry: LogEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      action,
      success: false,
      errorCode,
      errorMessage: safeMessage,
      ...data,
      metadata: data?.metadata
        ? (sanitize(data.metadata) as Record<string, unknown>)
        : undefined,
    };
    console.error(JSON.stringify(entry));
  },
};
