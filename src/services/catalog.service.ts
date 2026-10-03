import { providerConnectionService } from './provider-connection.service';
import type { CatalogProvider, CatalogVoice } from '@/lib/providers/voice/provider-types';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

interface CatalogResult {
  llms: CatalogProvider[];
  voices: CatalogVoice[];
  stt: CatalogProvider[];
  tts: CatalogProvider[];
}

export class CatalogService {
  private cache = new Map<string, CacheEntry<unknown>>();

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data as T;
    }
    return null;
  }

  private setCached<T>(key: string, data: T): T {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return data;
  }

  async getCatalog(organizationId: string): Promise<CatalogResult> {
    const cacheKey = `catalog_${organizationId}`;
    const cached = this.getCached<CatalogResult>(cacheKey);
    if (cached) return cached;

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    const [llms, voices, stt, tts] = await Promise.all([
      provider.listLLMs().catch(() => []),
      provider.listVoices().catch(() => []),
      provider.listSTT().catch(() => []),
      provider.listTTS().catch(() => []),
    ]);

    const result = { llms, voices, stt, tts };
    return this.setCached(cacheKey, result);
  }

  async listVoices(organizationId: string, query?: { provider?: string; language?: string; search?: string }): Promise<CatalogVoice[]> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.listVoices(query);
  }

  async getVoice(organizationId: string, voiceId: string): Promise<CatalogVoice | null> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.getVoice(voiceId);
  }
}

export const catalogService = new CatalogService();
