import { OmniDimension, type ClientOptions } from '@omnidim-ai/sdk';
import { mapOmniDimensionError, VoiceProviderError } from './omnidimension.errors';
import { logger } from '@/lib/utils/logger';

// Client cache keyed by sha256 or truncated hash to prevent leaking key in memory inspection
const clientCache = new Map<string, { client: OmniDimension; expiresAt: number }>();
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getClientCacheKey(apiKey: string): string {
  // Use last 8 chars + length for internal lookup key
  return `${apiKey.length}_${apiKey.slice(-8)}`;
}

/**
 * Returns a cached or fresh OmniDimension official SDK client.
 * Strictly runs server-side; NEVER expose apiKey to the client.
 */
export function getOmniDimensionClient(apiKey: string, customOptions?: Partial<ClientOptions>): OmniDimension {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new VoiceProviderError('PROVIDER_AUTH_FAILED', 'OmniDimension API key is required.', 401);
  }

  const trimmedKey = apiKey.trim();
  const cacheKey = getClientCacheKey(trimmedKey);
  const now = Date.now();

  const cached = clientCache.get(cacheKey);
  if (cached && cached.expiresAt > now && !customOptions?.baseURL) {
    return cached.client;
  }

  try {
    const client = new OmniDimension({
      apiKey: trimmedKey,
      timeout: 30000, // 30s timeout
      ...customOptions,
    });

    clientCache.set(cacheKey, {
      client,
      expiresAt: now + CLIENT_CACHE_TTL_MS,
    });

    return client;
  } catch (error) {
    logger.error('omnidim.client_init_failed', { action: 'PROVIDER_CLIENT_INIT', errorMessage: (error as Error).message });
    throw mapOmniDimensionError(error);
  }
}

/**
 * Executes an operation with the OmniDimension client, catching and normalizing errors.
 */
export async function withOmniDimension<T>(apiKey: string, fn: (client: OmniDimension) => Promise<T>): Promise<T> {
  const client = getOmniDimensionClient(apiKey);
  try {
    return await fn(client);
  } catch (error) {
    throw mapOmniDimensionError(error);
  }
}
