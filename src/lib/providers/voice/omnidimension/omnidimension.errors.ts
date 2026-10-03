import { OmniDimensionError } from '@omnidim-ai/sdk';

export type ProviderErrorCode =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_VALIDATION_ERROR'
  | 'PROVIDER_CONFLICT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN_ERROR';

export class VoiceProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly httpStatus: number;
  readonly provider: 'OMNIDIMENSION';
  readonly details?: unknown;

  constructor(code: ProviderErrorCode, message: string, httpStatus: number = 500, details?: unknown) {
    super(message);
    this.name = 'VoiceProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.provider = 'OMNIDIMENSION';
    this.details = details;
  }
}

/**
 * Normalizes any external error (SDK error, HTTP error, timeout) into a typed VoiceProviderError
 */
export function mapOmniDimensionError(error: unknown): VoiceProviderError {
  if (error instanceof VoiceProviderError) {
    return error;
  }

  const status =
    (error instanceof OmniDimensionError ? error.status : undefined) ||
    (typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined) ||
    (typeof error === 'object' && error !== null && 'statusCode' in error ? (error as { statusCode?: number }).statusCode : undefined);

  if (status !== undefined || error instanceof OmniDimensionError) {
    const body = typeof error === 'object' && error !== null && 'body' in error ? (error as { body?: unknown }).body : undefined;
    const msg =
      (error instanceof Error ? error.message : undefined) ||
      (typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : undefined) ||
      'OmniDimension request failed';

    if (status === 401 || status === 403) {
      return new VoiceProviderError(
        'PROVIDER_AUTH_FAILED',
        'OmniDimension authentication failed. Please check your API key.',
        401,
        body
      );
    }

    if (status === 429) {
      return new VoiceProviderError(
        'PROVIDER_RATE_LIMITED',
        'OmniDimension rate limit exceeded. Please retry after a brief delay.',
        429,
        body
      );
    }

    if (status === 404) {
      return new VoiceProviderError(
        'PROVIDER_NOT_FOUND',
        'The requested resource was not found on OmniDimension.',
        404,
        body
      );
    }

    if (status === 400 || status === 422) {
      return new VoiceProviderError(
        'PROVIDER_VALIDATION_ERROR',
        msg,
        400,
        body
      );
    }

    if (status === 409) {
      return new VoiceProviderError(
        'PROVIDER_CONFLICT',
        'Resource conflict on OmniDimension.',
        409,
        body
      );
    }

    if (status === 502 || status === 503 || status === 504) {
      return new VoiceProviderError(
        'PROVIDER_UNAVAILABLE',
        'OmniDimension service is temporarily unavailable.',
        503,
        body
      );
    }

    if (status === 408) {
      return new VoiceProviderError(
        'PROVIDER_TIMEOUT',
        'OmniDimension request timed out.',
        504,
        body
      );
    }

    return new VoiceProviderError(
      'PROVIDER_UNKNOWN_ERROR',
      msg,
      status || 500,
      body
    );
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('etimedout')) {
      return new VoiceProviderError('PROVIDER_TIMEOUT', 'Connection to OmniDimension timed out.', 504);
    }
    if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network')) {
      return new VoiceProviderError('PROVIDER_UNAVAILABLE', 'Network failure contacting OmniDimension.', 503);
    }
    return new VoiceProviderError('PROVIDER_UNKNOWN_ERROR', error.message, 500);
  }

  return new VoiceProviderError('PROVIDER_UNKNOWN_ERROR', 'An unexpected provider error occurred', 500);
}
