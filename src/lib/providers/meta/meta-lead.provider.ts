import { createHmac } from 'crypto';
import { logger } from '@/lib/utils/logger';

export interface MetaFieldData {
  name: string;
  values: string[];
}

export interface MetaLeadPayload {
  id: string; // leadgen_id
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  form_name?: string;
  page_id?: string;
  page_name?: string;
  field_data?: MetaFieldData[];
}

export interface NormalizedMetaLead {
  externalId: string;
  externalPlatform: 'META';
  createdTime?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  company?: string;
  city?: string;
  state?: string;
  country?: string;
  customFields: Record<string, unknown>;
  attribution: {
    pageId?: string;
    pageName?: string;
    formId?: string;
    formName?: string;
    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adsetName?: string;
    adId?: string;
    adName?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
}

export interface MetaPageInfo {
  id: string;
  name: string;
  pageId?: string;
  pageName?: string;
  isValid?: boolean;
  access_token?: string;
}

export class MetaLeadProvider {
  private apiVersion: string;
  private baseUrl: string;

  constructor() {
    this.apiVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Verify Page Access Token and retrieve Page information
   */
  async verifyPageToken(pageAccessToken: string, pageId?: string): Promise<MetaPageInfo> {
    const target = pageId ? `${this.baseUrl}/${pageId}` : `${this.baseUrl}/me`;
    const url = `${target}?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error?.message || `Meta API verification failed with status ${response.status}`);
      }

      return {
        id: data.id,
        name: data.name,
        pageId: data.id,
        pageName: data.name,
        isValid: true,
      };
    } catch (err) {
      logger.error('meta.verify_page_failed', {
        action: 'META_VERIFY',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Retrieve Leadgen forms for a given Page
   */
  async getPageForms(pageId: string, pageAccessToken: string): Promise<Array<{ id: string; name: string }>> {
    const url = `${this.baseUrl}/${pageId}/leadgen_forms?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`;
    try {
      const response = await fetch(url, { method: 'GET' });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error?.message || `Failed to fetch forms: ${response.status}`);
      }
      return data.data || [];
    } catch (err) {
      logger.warn('meta.get_page_forms_failed', {
        action: 'META_GET_FORMS',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Subscribe an application to the Page's leadgen webhooks
   * POST /{page_id}/subscribed_apps?subscribed_fields=leadgen
   */
  async subscribePageWebhooks(pageId: string, pageAccessToken: string): Promise<boolean> {
    const url = `${this.baseUrl}/${pageId}/subscribed_apps`;
    const params = new URLSearchParams({
      subscribed_fields: 'leadgen',
      access_token: pageAccessToken,
    });

    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        logger.warn('meta.subscribe_webhook_failed', {
          action: 'META_SUBSCRIBE',
          metadata: { pageId, error: data.error?.message },
        });
        return false;
      }

      return data.success === true;
    } catch (err) {
      logger.warn('meta.subscribe_webhook_exception', {
        action: 'META_SUBSCRIBE',
        errorMessage: (err as Error).message,
      });
      return false;
    }
  }

  /**
   * Retrieve lead details from Meta Graph API using leadgen_id
   * GET /{leadgen_id}?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,page_id,field_data
   */
  async fetchLeadDetails(
    leadgenId: string,
    pageAccessToken: string
  ): Promise<MetaLeadPayload> {
    const fields = [
      'id',
      'created_time',
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'form_id',
      'form_name',
      'page_id',
      'field_data',
    ].join(',');

    const url = `${this.baseUrl}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;

    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `Meta Graph API lead retrieval failed (${response.status})`;
      logger.error('meta.fetch_lead_failed', {
        action: 'META_LEAD_FETCH',
        metadata: { leadgenId, error: errMsg },
      });
      throw new Error(errMsg);
    }

    return data as MetaLeadPayload;
  }

  /**
   * Normalize Meta Lead data into canonical CRM format
   */
  normalizeLead(payload: MetaLeadPayload): NormalizedMetaLead {
    const customFields: Record<string, unknown> = {};
    let firstName: string | undefined;
    let lastName: string | undefined;
    let fullName: string | undefined;
    let phone: string | undefined;
    let email: string | undefined;
    let company: string | undefined;
    let city: string | undefined;
    let state: string | undefined;
    let country: string | undefined;

    if (Array.isArray(payload.field_data)) {
      for (const field of payload.field_data) {
        const key = (field.name || '').toLowerCase().trim();
        const val = field.values && field.values.length > 0 ? field.values[0] : '';
        if (!val) continue;

        if (key === 'full_name' || key === 'name') {
          fullName = val;
        } else if (key === 'first_name') {
          firstName = val;
        } else if (key === 'last_name') {
          lastName = val;
        } else if (key === 'phone_number' || key === 'phone' || key === 'mobile_number') {
          phone = val;
        } else if (key === 'email' || key === 'email_address') {
          email = val;
        } else if (key === 'company_name' || key === 'company') {
          company = val;
        } else if (key === 'city') {
          city = val;
        } else if (key === 'state' || key === 'province') {
          state = val;
        } else if (key === 'country') {
          country = val;
        } else {
          customFields[field.name] = val;
        }
      }
    }

    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(' ');
    } else if (fullName && (!firstName && !lastName)) {
      const parts = fullName.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || undefined;
    }

    return {
      externalId: payload.id,
      externalPlatform: 'META',
      createdTime: payload.created_time,
      firstName,
      lastName,
      fullName: fullName || 'Meta Lead',
      phone,
      email,
      company,
      city,
      state,
      country,
      customFields,
      attribution: {
        pageId: payload.page_id,
        pageName: payload.page_name,
        formId: payload.form_id,
        formName: payload.form_name,
        campaignId: payload.campaign_id,
        campaignName: payload.campaign_name,
        adsetId: payload.adset_id,
        adsetName: payload.adset_name,
        adId: payload.ad_id,
        adName: payload.ad_name,
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: payload.campaign_name,
      },
    };
  }

  /**
   * Helper to normalize raw field_data array from Meta webhook/API
   */
  normalizeLeadData(fieldData: Array<{ name: string; values: string[] }>): NormalizedMetaLead {
    return this.normalizeLead({ id: 'test_lead', field_data: fieldData });
  }

  /**
   * Verify HMAC SHA-256 signature on inbound webhooks from Meta
   */
  verifyWebhookSignature(payloadRaw: string, signatureHeader?: string | null, appSecret?: string): boolean {
    if (!signatureHeader) return false;
    const secret = appSecret || process.env.META_APP_SECRET;
    if (!secret) return true; // If no app secret configured, allow or skip

    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return false;
    }

    const expectedSignature = createHmac('sha256', secret).update(payloadRaw).digest('hex');
    return parts[1] === expectedSignature;
  }
}

export const metaLeadProvider = new MetaLeadProvider();
