import {
  leadSourceRepository,
  CreateLeadSourceInput,
  UpdateLeadSourceInput,
} from '@/lib/db/repositories/lead-source.repository';
import { LeadSource, LeadSourceType } from '@/types/crm';
import { generateUUID } from '@/lib/utils/crypto';

export class LeadSourceService {
  /**
   * Ensure default lead sources exist for an organization (Manual, Website, CSV, Meta Lead Ads, API, Campaign)
   */
  async ensureDefaultSources(organizationId: string): Promise<void> {
    const existing = await leadSourceRepository.list(organizationId);
    const existingTypes = new Set(existing.map((s) => s.type));

    const defaults: { name: string; type: LeadSourceType; platform?: string }[] = [
      { name: 'Manual Entry', type: 'MANUAL', platform: 'MANUAL' },
      { name: 'Website Inbound Form', type: 'WEBSITE', platform: 'WEB' },
      { name: 'CSV Import', type: 'CSV', platform: 'CSV' },
      { name: 'Meta Lead Ads', type: 'META_LEAD_AD', platform: 'META' },
      { name: 'API Ingestion', type: 'API', platform: 'API' },
      { name: 'VoiceNuvo Campaign', type: 'CAMPAIGN', platform: 'VOICENUVO_CAMPAIGN' },
    ];

    for (const def of defaults) {
      if (!existingTypes.has(def.type)) {
        await leadSourceRepository.create({
          id: generateUUID(),
          organizationId,
          name: def.name,
          type: def.type,
          platform: def.platform,
          isActive: true,
          config: { auto_call_enabled: false },
        });
      }
    }
  }

  async getSource(id: string, organizationId: string): Promise<LeadSource | null> {
    return leadSourceRepository.findById(id, organizationId);
  }

  async getSourceByType(
    organizationId: string,
    type: LeadSourceType
  ): Promise<LeadSource | null> {
    const sources = await leadSourceRepository.findByType(organizationId, type);
    return sources.length > 0 ? sources[0] : null;
  }

  async listSources(organizationId: string): Promise<LeadSource[]> {
    await this.ensureDefaultSources(organizationId);
    return leadSourceRepository.list(organizationId);
  }

  async createSource(input: CreateLeadSourceInput): Promise<LeadSource> {
    return leadSourceRepository.create(input);
  }

  async updateSource(
    id: string,
    organizationId: string,
    input: UpdateLeadSourceInput
  ): Promise<LeadSource | null> {
    return leadSourceRepository.update(id, organizationId, input);
  }

  async deleteSource(id: string, organizationId: string): Promise<boolean> {
    return leadSourceRepository.delete(id, organizationId);
  }
}

export const leadSourceService = new LeadSourceService();
