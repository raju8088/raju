import { createHmac, timingSafeEqual } from 'crypto';
import { SessionPayload } from '@/types';

export const SESSION_COOKIE_NAME = 'voicenuvo_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'voicenuvo-phase2-prod-session-secret-key-32chars';

/**
 * Sign session payload using HMAC-SHA256 to prevent client-side tampering
 */
export function signPayload(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(base64).digest('base64url');
  return `${base64}.${signature}`;
}

/**
 * Verify HMAC signature with timing-safe comparison and parse session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64, signature] = parts;
    const expectedSig = createHmac('sha256', SESSION_SECRET).update(base64).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const json = Buffer.from(base64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as SessionPayload;

    if (Date.now() > payload.expiresAt) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
