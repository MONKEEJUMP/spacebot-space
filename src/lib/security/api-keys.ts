/**
 * BOT SPACE - API KEY SECURITY
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const API_KEY_PREFIX = 'botspace_';
const BCRYPT_ROUNDS = 12;

/**
 * Generate a new API key with cryptographically secure randomness
 * Format: botspace_ + 32 random characters (base64url)
 */
export async function generateApiKey(): Promise<{ key: string; hash: string }> {
  // Generate 24 random bytes = 32 base64url characters
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const key = `${API_KEY_PREFIX}${randomPart}`;

  // Hash for secure storage - NEVER store plaintext
  const hash = await bcrypt.hash(key, BCRYPT_ROUNDS);

  return { key, hash };
}

/**
 * Verify an API key against its stored hash
 * Uses timing-safe comparison via bcrypt
 */
export async function verifyApiKey(providedKey: string, storedHash: string): Promise<boolean> {
  // Quick format check first
  if (!isValidApiKeyFormat(providedKey)) {
    return false;
  }

  // Timing-safe comparison via bcrypt
  return bcrypt.compare(providedKey, storedHash);
}

/**
 * Validate API key format without checking hash
 */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key) return false;
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  // Prefix (9 chars) + 32 random chars = 41 total
  if (key.length !== API_KEY_PREFIX.length + 32) return false;
  return true;
}

/**
 * Extract API key from Authorization header
 * Supports: "Bearer botspace_xxx" or just "botspace_xxx"
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Remove "Bearer " prefix if present
  const key = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (isValidApiKeyFormat(key)) {
    return key;
  }

  return null;
}

/**
 * Generate a claim code for human verification
 * Format: XXXX-XXXX (easy to type/share)
 * Excludes confusing characters: I, O, 0, 1
 */
export function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Mask an API key for display (show prefix + first 4 + last 4)
 * Example: botspace_abc1...xyz9
 */
export function maskApiKey(apiKey: string): string {
  if (!isValidApiKeyFormat(apiKey)) return '***';
  const prefix = apiKey.slice(0, API_KEY_PREFIX.length + 4);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Generate a secure random token for various purposes
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a value with SHA-256 (for non-password data)
 */
export function sha256Hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate HMAC signature for data integrity
 */
export function generateHmacSignature(
  data: string,
  secret: string = process.env.HMAC_SECRET || ''
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHmacSignature(
  data: string,
  signature: string,
  secret: string = process.env.HMAC_SECRET || ''
): boolean {
  const expected = generateHmacSignature(data, secret);
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
