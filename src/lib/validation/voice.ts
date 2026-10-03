import { z } from 'zod';

export const saveConnectionSchema = z.object({
  apiKey: z.string().trim().min(5, 'OmniDimension API key is required and must be valid'),
  displayName: z.string().trim().max(100).optional().default('OmniDimension Voice'),
});

export const testConnectionSchema = z.object({
  apiKey: z.string().trim().min(5, 'OmniDimension API key is required'),
});

export const contextItemSchema = z.object({
  title: z.string().trim().min(1, 'Context title is required'),
  body: z.string().trim().min(1, 'Context body is required'),
  isEnabled: z.boolean().optional().default(true),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1, 'Agent name is required').max(255),
  welcomeMessage: z.string().trim().max(1000).optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voiceProvider: z.string().optional(),
  model: z.string().optional(),
  language: z.string().optional(),
  speechSpeed: z.number().min(0.5).max(2.0).optional().default(1.0),
  enableWebSearch: z.boolean().optional().default(false),
  webSearchEngine: z.string().optional(),
  voicemailEnabled: z.boolean().optional().default(false),
  voicemailMessage: z.string().optional(),
  isEndCallEnabled: z.boolean().optional().default(false),
  endCallMessage: z.string().optional(),
  maxDurationSec: z.number().int().min(30).max(3600).optional().default(600),
  contextBreakdown: z.array(contextItemSchema).optional(),
});

export const updateAgentSchema = createAgentSchema.partial().extend({
  status: z.string().optional(),
});

export const saveVersionSchema = z.object({
  name: z.string().trim().max(100).optional(),
});

export const attachKbFilesSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  fileIds: z.array(z.string().min(1)).min(1, 'At least one file ID is required'),
});

export const searchPhoneNumbersSchema = z.object({
  region: z.enum(['US', 'IN']).default('US'),
  carrier: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

export const purchasePhoneNumberSchema = z.object({
  phoneNumber: z.string().trim().min(6, 'Valid phone number is required'),
  carrier: z.string().optional(),
  region: z.enum(['US', 'IN']).optional().default('US'),
  idempotencyKey: z.string().optional(),
});

export const attachPhoneNumberSchema = z.object({
  phoneId: z.string().min(1, 'Phone ID is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

export const detachPhoneNumberSchema = z.object({
  phoneId: z.string().min(1, 'Phone ID is required'),
});
