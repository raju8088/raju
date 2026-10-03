import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const SALT = 'voicenuvo-provider-key-derivation-salt';

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('ENCRYPTION_SECRET is unset. Encryption operations require an encryption secret.');
  }
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a sensitive secret string using authenticated AES-256-GCM
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty secret');
  }

  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an AES-256-GCM encrypted payload
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error('Encrypted payload is empty');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(parts[2], 'hex');
  const authTag = Buffer.from(parts[3], 'hex');
  const ciphertext = parts[4];

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Safely mask an API key for logs or UI indicators
 * Example: "od_key_abcdef123456" -> "••••••••3456"
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  const lastFour = key.slice(-4);
  return `••••••••${lastFour}`;
}
