import { z } from 'zod';

/**
 * Validates international E.164 format:
 * - Must start with +
 * - First digit after + must be 1-9
 * - Total length: 7 to 15 digits
 */
export const e164PhoneRegex = /^\+[1-9]\d{6,14}$/;

export const dispatchCallSchema = z.object({
  agentId: z.string().trim().min(1, 'Agent ID is required'),
  toNumber: z
    .string()
    .trim()
    .regex(
      e164PhoneRegex,
      'Destination phone number must be in valid international E.164 format starting with +, e.g., +14155552671'
    ),
  fromNumberId: z.string().trim().optional(),
  callContext: z
    .record(z.string().max(100), z.union([z.string().max(1000), z.number(), z.boolean()]))
    .refine((obj) => Object.keys(obj).length <= 25, 'Call context cannot exceed 25 keys')
    .optional()
    .default({}),
  metadata: z
    .record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean()]))
    .refine((obj) => Object.keys(obj).length <= 25, 'Metadata cannot exceed 25 keys')
    .optional()
    .default({}),
  idempotencyKey: z.string().trim().max(255).optional(),
});

export const listCallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
  agentId: z.string().trim().optional(),
  phoneNumberId: z.string().trim().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const callWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  call_id: z.union([z.string(), z.number()]).optional(),
  provider_call_id: z.union([z.string(), z.number()]).optional(),
  requestId: z.union([z.string(), z.number()]).optional(),
  call_request_id: z.unknown().optional(),
  status: z.string().optional(),
  call_status: z.string().optional(),
  call_duration: z.string().optional(),
  call_duration_in_seconds: z.union([z.number(), z.string()]).optional(),
  time_of_call: z.string().optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  recording_url: z.union([z.string(), z.boolean()]).optional(),
  internal_recording_url: z.union([z.string(), z.boolean()]).optional(),
  sentiment_score: z.string().optional(),
  sentiment_analysis_details: z.string().optional(),
  summary: z.string().optional(),
  call_conversation: z.string().optional(),
  extracted_variables: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
