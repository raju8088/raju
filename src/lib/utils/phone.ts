import { e164PhoneRegex } from '@/lib/validation/call.schema';

export { e164PhoneRegex };

/**
 * Normalizes and validates an international phone number to E.164.
 * Throws an informative Error if invalid.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  if (!e164PhoneRegex.test(cleaned)) {
    throw new Error(
      `Invalid international phone number "${raw}". Must be in E.164 format (e.g. +14155552671, +919876543210)`
    );
  }

  return cleaned;
}
