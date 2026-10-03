import { z } from 'zod';

export const leadStatusEnum = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NURTURE',
  'CONVERTED',
  'LOST',
  'DISQUALIFIED',
]);

export const leadStageEnum = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFICATION',
  'FOLLOW_UP',
  'NEGOTIATION',
  'WON',
  'LOST',
]);

export const leadPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const leadSourceTypeEnum = z.enum([
  'META_LEAD_AD',
  'WEBSITE',
  'MANUAL',
  'CSV',
  'API',
  'CAMPAIGN',
  'OTHER',
]);

export const createLeadSchema = z.object({
  contact: z.object({
    firstName: z.string().max(100).optional().nullable(),
    lastName: z.string().max(100).optional().nullable(),
    fullName: z.string().max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    company: z.string().max(200).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    timezone: z.string().max(100).optional().nullable(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  }),
  lead: z.object({
    title: z.string().max(255).optional().nullable(),
    status: leadStatusEnum.default('NEW'),
    stage: leadStageEnum.default('NEW'),
    priority: leadPriorityEnum.default('MEDIUM'),
    score: z.number().int().min(0).max(100).default(0),
    qualificationStatus: z.string().max(50).default('UNQUALIFIED'),
    sourceId: z.string().uuid().optional().nullable(),
    sourceType: leadSourceTypeEnum.default('MANUAL'),
    sourceName: z.string().max(255).optional().nullable(),
    utmSource: z.string().max(100).optional().nullable(),
    utmMedium: z.string().max(100).optional().nullable(),
    utmCampaign: z.string().max(100).optional().nullable(),
    utmTerm: z.string().max(100).optional().nullable(),
    utmContent: z.string().max(100).optional().nullable(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    externalId: z.string().max(255).optional().nullable(),
    externalPlatform: z.string().max(50).optional().nullable(),
    externalFormId: z.string().max(255).optional().nullable(),
    externalAdId: z.string().max(255).optional().nullable(),
    externalCampaignId: z.string().max(255).optional().nullable(),
  }),
});

export const updateLeadSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  status: leadStatusEnum.optional(),
  stage: leadStageEnum.optional(),
  priority: leadPriorityEnum.optional(),
  score: z.number().int().min(0).max(100).optional(),
  qualificationStatus: z.string().max(50).optional(),
  sourceId: z.string().uuid().optional().nullable(),
  sourceType: leadSourceTypeEnum.optional(),
  sourceName: z.string().max(255).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  utmTerm: z.string().max(100).optional().nullable(),
  utmContent: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  lostReason: z.string().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const assignLeadSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
});

export const addNoteSchema = z.object({
  body: z.string().min(1, 'Note content cannot be empty').max(5000),
});

export const scheduleFollowUpSchema = z.object({
  followUpAt: z.string().datetime({ message: 'Must be a valid ISO datetime string' }),
});

export const callLeadSchema = z.object({
  agentId: z.string().uuid('Agent ID must be a valid UUID'),
  fromNumberId: z.string().uuid().optional(),
});

export const listLeadsQuerySchema = z.object({
  status: leadStatusEnum.optional(),
  stage: leadStageEnum.optional(),
  sourceId: z.string().uuid().optional(),
  sourceType: leadSourceTypeEnum.optional(),
  assignedUserId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  priority: leadPriorityEnum.optional(),
  followUpStatus: z.enum(['NONE', 'PENDING', 'COMPLETED', 'CANCELED']).optional(),
  search: z.string().max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.enum(['created_at', 'updated_at', 'next_follow_up_at', 'priority']).default('created_at'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
});

export const inboundLeadSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  fullName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  company: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  formId: z.string().max(100).optional(),
  sourceName: z.string().max(100).default('Website Form'),
  customFields: z.record(z.string(), z.unknown()).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_term: z.string().max(100).optional(),
  utm_content: z.string().max(100).optional(),
});

export const connectMetaSchema = z.object({
  pageId: z.string().min(1, 'Page ID is required'),
  pageAccessToken: z.string().min(1, 'Page Access Token is required'),
  pageName: z.string().optional(),
  businessId: z.string().optional(),
  adAccountId: z.string().optional(),
  autoCallEnabled: z.boolean().default(false),
  autoCallAgentId: z.string().uuid().optional().nullable(),
  autoCallPhoneNumberId: z.string().uuid().optional().nullable(),
});
