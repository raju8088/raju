import { z } from 'zod';
import { e164PhoneRegex } from './call.schema';

export { e164PhoneRegex };

export const createCampaignSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      return {
        ...v,
        agentId: v.agentId || v.agent_id,
        phoneNumberId: v.phoneNumberId || v.phone_number_id,
        rotationPoolNumberIds: v.rotationPoolNumberIds || v.number_pool_ids || v.rotation_pool_number_ids || [],
        rotationStrategy: v.rotationStrategy || (v.rotation_strategy === 'HEALTH_BASED' ? 'both' : v.rotation_strategy) || 'fixed_count',
        retryPolicy: v.retryPolicy || v.retry_policy,
        callingWindow: v.callingWindow || v.calling_window,
        saveAsDraft: v.saveAsDraft !== undefined ? v.saveAsDraft : (v.save_as_draft !== undefined ? v.save_as_draft : true),
      };
    }
    return val;
  },
  z.object({
    name: z.string().trim().min(1, 'Campaign name is required').max(255),
    description: z.string().trim().max(1000).optional(),
    agentId: z.string().trim().min(1, 'Valid agent ID is required'),
    phoneNumberId: z.string().trim().min(1).optional().nullable(),
    saveAsDraft: z.boolean().default(true),
    timezone: z.string().trim().default('UTC'),
    concurrency: z.coerce.number().int().min(1).max(50).default(1),
    retryPolicy: z
      .object({
        autoRetry: z.boolean().default(false),
        autoRetrySchedule: z.enum(['immediately', 'next_day', 'scheduled_time']).default('immediately'),
        retryScheduleDays: z.number().int().min(0).default(0),
        retryScheduleHours: z.number().int().min(0).default(0),
        retryLimit: z.number().int().min(1).max(10).default(1),
        failureReasons: z.array(z.string()).optional(),
      })
      .optional()
      .default({
        autoRetry: false,
        autoRetrySchedule: 'immediately',
        retryScheduleDays: 0,
        retryScheduleHours: 0,
        retryLimit: 1,
      }),
    callingWindow: z
      .object({
        enabled: z.boolean().default(false),
        startTime: z.number().min(0).max(23.99).default(9),
        stopTime: z.number().min(0).max(23.99).default(18),
        timezone: z.string().default('UTC'),
      })
      .optional()
      .default({ enabled: false, startTime: 9, stopTime: 18, timezone: 'UTC' }),
    rotationPoolNumberIds: z.array(z.string().trim().min(1)).optional().default([]),
    rotationStrategy: z.enum(['fixed_count', 'cpr_threshold', 'both', 'none']).default('fixed_count'),
    callsPerNumber: z.number().int().min(1).default(50),
  })
);

export const updateCampaignSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      return {
        ...v,
        agentId: v.agentId || v.agent_id,
        phoneNumberId: v.phoneNumberId || v.phone_number_id,
        rotationPoolNumberIds: v.rotationPoolNumberIds || v.number_pool_ids || v.rotation_pool_number_ids,
        rotationStrategy: v.rotationStrategy || (v.rotation_strategy === 'HEALTH_BASED' ? 'both' : v.rotation_strategy),
        retryPolicy: v.retryPolicy || v.retry_policy,
        callingWindow: v.callingWindow || v.calling_window,
      };
    }
    return val;
  },
  z.object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).optional(),
    agentId: z.string().trim().min(1).optional(),
    phoneNumberId: z.string().trim().min(1).optional().nullable(),
    timezone: z.string().trim().optional(),
    concurrency: z.coerce.number().int().min(1).max(50).optional(),
    retryPolicy: z
      .object({
        autoRetry: z.boolean().default(false),
        autoRetrySchedule: z.enum(['immediately', 'next_day', 'scheduled_time']).default('immediately'),
        retryScheduleDays: z.number().int().min(0).default(0),
        retryScheduleHours: z.number().int().min(0).default(0),
        retryLimit: z.number().int().min(1).max(10).default(1),
        failureReasons: z.array(z.string()).optional(),
      })
      .optional(),
    callingWindow: z
      .object({
        enabled: z.boolean().default(false),
        startTime: z.number().min(0).max(23.99).default(9),
        stopTime: z.number().min(0).max(23.99).default(18),
        timezone: z.string().default('UTC'),
      })
      .optional(),
    rotationPoolNumberIds: z.array(z.string().trim().min(1)).optional(),
    rotationStrategy: z.enum(['fixed_count', 'cpr_threshold', 'both', 'none']).optional(),
    callsPerNumber: z.number().int().min(1).optional(),
  })
);

// Aliases for PascalCase and snake_case flexibility
export const CreateCampaignSchema = createCampaignSchema;
export const UpdateCampaignSchema = updateCampaignSchema;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const singleContactSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      return {
        ...v,
        phoneNumber: v.phoneNumber || v.phone_number || v.phone || v.toNumber || v.to_number,
        customVariables: v.customVariables || v.custom_variables || {},
        metadata: v.metadata || {},
      };
    }
    return val;
  },
  z.object({
    phoneNumber: z
      .string()
      .trim()
      .regex(e164PhoneRegex, 'Phone number must be in E.164 format (+[1-9]XXXXXXXXX)'),
    customVariables: z
      .record(z.string().max(100), z.union([z.string().max(1000), z.number(), z.boolean()]))
      .refine((obj) => Object.keys(obj).length <= 50, 'Custom variables cannot exceed 50 keys')
      .optional()
      .default({}),
    metadata: z
      .record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean()]))
      .refine((obj) => Object.keys(obj).length <= 25, 'Metadata cannot exceed 25 keys')
      .optional()
      .default({}),
  })
);

export const importContactItemSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      return {
        ...v,
        phoneNumber: String(v.phoneNumber || v.phone_number || v.phone || v.toNumber || v.to_number || ''),
        customVariables: v.customVariables || v.custom_variables || {},
        metadata: v.metadata || {},
      };
    }
    return val;
  },
  z.object({
    phoneNumber: z.string().default(''),
    customVariables: z
      .record(z.string().max(100), z.unknown())
      .optional()
      .default({}),
    metadata: z
      .record(z.string().max(100), z.unknown())
      .optional()
      .default({}),
  })
);

export const importContactsSchema = z.object({
  contacts: z.array(importContactItemSchema).min(1, 'At least 1 contact is required').max(10000, 'Maximum 10,000 contacts per import'),
});

export const setConcurrencySchema = z.object({
  concurrency: z.coerce.number().int().min(1, 'Concurrency must be at least 1').max(50, 'Concurrency cannot exceed 50'),
});

export const setDailyTimeControlSchema = z.object({
  enableDailyHardStop: z.boolean().default(true),
  dailyStopTime: z.coerce.number().min(0).max(23.99).default(18),
  dailyStopTimezone: z.string().default('UTC'),
  enableDailyAutoStart: z.boolean().default(true),
  dailyStartTime: z.coerce.number().min(0).max(23.99).default(9),
  dailyStartTimezone: z.string().default('UTC'),
});

export const retryCampaignSchema = z.object({
  retryStrategy: z.string().default('all'),
  maxRetries: z.coerce.number().int().min(1).max(10).default(2),
  failureReasons: z.array(z.string()).optional().default(['no-answer', 'busy', 'failed']),
});

export const addCampaignNumberSchema = z.object({
  phoneNumberId: z.string().trim().min(1, 'Valid phone number ID is required'),
});

// Aliases
export const ImportContactsSchema = importContactsSchema;
export const AddContactsSchema = importContactsSchema;
export const SetConcurrencySchema = setConcurrencySchema;
export const SetDailyTimeControlSchema = setDailyTimeControlSchema;
export const RetryCampaignSchema = retryCampaignSchema;
export const AddCampaignNumberSchema = addCampaignNumberSchema;

export type SingleContactInput = z.infer<typeof singleContactSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type AddContactsInput = z.infer<typeof importContactsSchema>;
export type SetConcurrencyInput = z.infer<typeof setConcurrencySchema>;
export type SetDailyTimeControlInput = z.infer<typeof setDailyTimeControlSchema>;
export type RetryCampaignInput = z.infer<typeof retryCampaignSchema>;
export type AddCampaignNumberInput = z.infer<typeof addCampaignNumberSchema>;

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
});

export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
});

export interface CsvContactItem {
  phoneNumber: string;
  normalizedPhoneNumber: string;
  customVariables: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface CsvRejectedItem {
  row: number;
  raw: Record<string, string>;
  reason: string;
}

export interface CsvParseResult {
  accepted: CsvContactItem[];
  rejected: CsvRejectedItem[];
  totalRows: number;
}

/**
 * Parses and validates CSV string server-side without external dependencies.
 * Handles quotes, commas inside quotes, variable headers, phone normalization, and row-level rejection.
 */
export function parseAndValidateCsv(csvText: string, defaultCountryCode = ''): CsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { accepted: [], rejected: [], totalRows: 0 };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvRow(headerLine).map((h) => h.toLowerCase().trim());

  // Locate phone column
  const phoneAliases = ['phone', 'phone_number', 'phonenumber', 'to_number', 'mobile', 'telephone', 'contact', 'recipient'];
  let phoneColIdx = headers.findIndex((h) => phoneAliases.includes(h));
  if (phoneColIdx === -1) {
    // If not found by exact alias, look for substring
    phoneColIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'));
  }
  if (phoneColIdx === -1 && headers.length === 1) {
    phoneColIdx = 0; // Single column CSV
  }

  const accepted: CsvContactItem[] = [];
  const rejected: CsvRejectedItem[] = [];
  const seenPhones = new Set<string>();

  const maxRows = 10000;
  const rowsToProcess = Math.min(lines.length - 1, maxRows);

  for (let i = 1; i <= rowsToProcess; i++) {
    const rawRow = parseCsvRow(lines[i]);
    const rawRecord: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawRecord[h] = rawRow[idx] || '';
    });

    if (phoneColIdx === -1) {
      rejected.push({
        row: i + 1,
        raw: rawRecord,
        reason: 'Could not identify phone number column in CSV header (expected "phone", "phone_number", or "mobile")',
      });
      continue;
    }

    const rawPhone = rawRow[phoneColIdx]?.trim() || '';
    if (!rawPhone) {
      rejected.push({
        row: i + 1,
        raw: rawRecord,
        reason: 'Phone number is empty',
      });
      continue;
    }

    // Clean phone number: remove spaces, dashes, parens
    let cleanPhone = rawPhone.replace(/[\s\(\)\-\.]/g, '');
    if (!cleanPhone.startsWith('+')) {
      if (defaultCountryCode && !cleanPhone.startsWith(defaultCountryCode)) {
        cleanPhone = '+' + defaultCountryCode + cleanPhone;
      } else {
        cleanPhone = '+' + cleanPhone;
      }
    }

    // Validate E.164
    if (!e164PhoneRegex.test(cleanPhone)) {
      rejected.push({
        row: i + 1,
        raw: rawRecord,
        reason: `Invalid international E.164 phone format: "${rawPhone}". Must be +[1-9][digits], e.g. +14155552671`,
      });
      continue;
    }

    // Deduplication check in current batch
    if (seenPhones.has(cleanPhone)) {
      rejected.push({
        row: i + 1,
        raw: rawRecord,
        reason: `Duplicate phone number in CSV: "${cleanPhone}"`,
      });
      continue;
    }
    seenPhones.add(cleanPhone);

    // Extract custom variables (all other columns)
    const customVariables: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};

    headers.forEach((header, idx) => {
      if (idx === phoneColIdx) return;
      const val = rawRow[idx]?.trim();
      if (val === undefined || val === '') return;

      if (header.startsWith('meta_') || header.startsWith('internal_') || header === 'external_id') {
        metadata[header] = val;
      } else {
        customVariables[header] = val;
      }
    });

    accepted.push({
      phoneNumber: rawPhone,
      normalizedPhoneNumber: cleanPhone,
      customVariables,
      metadata,
    });
  }

  // If there were more than maxRows rows in the file
  if (lines.length - 1 > maxRows) {
    rejected.push({
      row: maxRows + 1,
      raw: {},
      reason: `CSV exceeds maximum limit of ${maxRows} contacts. Remaining ${lines.length - 1 - maxRows} rows were skipped.`,
    });
  }

  return {
    accepted,
    rejected,
    totalRows: accepted.length + rejected.length,
  };
}

function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
