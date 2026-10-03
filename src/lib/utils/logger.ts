export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: string;
  action: string;
  success: boolean;
  request?: {
    method?: string;
    url?: string;
    ip?: string;
  };
  user?: {
    id?: string;
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

// Redact any sensitive keys
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
]);

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const logger = {
  info(action: string, data?: Partial<LogEntry>) {
    const entry: LogEntry = {
      level: 'info',
      timestamp: new Date().toISOString(),
      action,
      success: data?.success !== false,
      ...data,
      metadata: data?.metadata ? (sanitize(data.metadata) as Record<string, unknown>) : undefined,
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
      metadata: data?.metadata ? (sanitize(data.metadata) as Record<string, unknown>) : undefined,
    };
    console.warn(JSON.stringify(entry));
  },

  error(action: string, error: unknown, data?: Partial<LogEntry>) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: string })?.code || 'INTERNAL_ERROR';

    const entry: LogEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      action,
      success: false,
      errorCode,
      errorMessage,
      ...data,
      metadata: data?.metadata ? (sanitize(data.metadata) as Record<string, unknown>) : undefined,
    };
    console.error(JSON.stringify(entry));
  },
};
