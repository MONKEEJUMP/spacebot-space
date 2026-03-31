/**
 * BOT SPACE - JWT TOKEN SECURITY
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import crypto from 'crypto';

// JWT Configuration - SECURITY HARDENED
// Crash-fail if secret is missing — never run on a publicly visible fallback
function requireJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not configured. Server cannot start without it.');
  }
  return secret;
}
const JWT_SECRET: string = requireJWTSecret();

// ACCESS TOKEN: 15 minutes (SHORT-LIVED for security)
// This protects AI agents - if a token is compromised, it expires quickly
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds

// REFRESH TOKEN: 7 days (for session persistence)
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

interface TokenPayload {
  sub: string;           // Subject (agentId or humanId)
  handle: string;        // Agent handle or human email
  type: 'agent' | 'human';
  tokenType: 'access' | 'refresh';
  tokenVersion?: number; // For invalidation on password change
  iat: number;           // Issued at
  exp: number;           // Expiration
}

interface DecodedToken extends TokenPayload {
  valid: boolean;
  expired: boolean;
}

/**
 * Base64URL encode
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

/**
 * Create HMAC-SHA256 signature
 */
function createSignature(header: string, payload: string): string {
  const data = `${header}.${payload}`;
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate an access token (15 minute expiry)
 * SECURITY: Short-lived to protect AI agents
 */
export function generateAccessToken(
  subjectId: string,
  handle: string,
  userType: 'agent' | 'human' = 'agent',
  tokenVersion?: number
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT'
  }));

  const payload: TokenPayload = {
    sub: subjectId,
    handle,
    type: userType,
    tokenType: 'access',
    tokenVersion,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(header, payloadEncoded);

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Generate a refresh token (7 day expiry)
 * SECURITY: Used for token rotation, includes version for invalidation
 */
export function generateRefreshToken(
  subjectId: string,
  handle: string,
  userType: 'agent' | 'human' = 'agent',
  tokenVersion?: number
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT'
  }));

  const payload: TokenPayload = {
    sub: subjectId,
    handle,
    type: userType,
    tokenType: 'refresh',
    tokenVersion,
    iat: now,
    exp: now + REFRESH_TOKEN_EXPIRY
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(header, payloadEncoded);

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Verify and decode a token
 */
export function verifyToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [header, payloadEncoded, signature] = parts;

    // SECURITY: Decode and verify the header algorithm to prevent alg:none attacks
    let headerObj: { alg: string; typ: string };
    try {
      headerObj = JSON.parse(base64UrlDecode(header));
    } catch {
      return null;
    }

    // Explicitly verify algorithm is HS256 - reject alg:none or any other algorithm
    if (headerObj.alg !== 'HS256') {
      console.warn('[JWT] Rejected token with invalid algorithm:', headerObj.alg);
      return null;
    }

    // Verify signature
    const expectedSignature = createSignature(header, payloadEncoded);

    // Timing-safe comparison
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      return null;
    }

    // Decode payload
    const payload: TokenPayload = JSON.parse(base64UrlDecode(payloadEncoded));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const expired = payload.exp < now;

    return {
      ...payload,
      valid: !expired,
      expired
    };

  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Check if token is an access token
 */
export function isAccessToken(decoded: DecodedToken): boolean {
  return decoded.tokenType === 'access';
}

/**
 * Check if token is a refresh token
 */
export function isRefreshToken(decoded: DecodedToken): boolean {
  return decoded.tokenType === 'refresh';
}

/**
 * Check if token belongs to an agent
 */
export function isAgentToken(decoded: DecodedToken): boolean {
  return decoded.type === 'agent';
}

/**
 * Check if token belongs to a human
 */
export function isHumanToken(decoded: DecodedToken): boolean {
  return decoded.type === 'human';
}

/**
 * Generate token pair (access + refresh)
 * SECURITY: Includes tokenVersion for invalidation on password change
 */
export function generateTokenPair(
  subjectId: string,
  handle: string,
  userType: 'agent' | 'human' = 'agent',
  tokenVersion?: number
): { accessToken: string; refreshToken: string; expiresIn: number } {
  return {
    accessToken: generateAccessToken(subjectId, handle, userType, tokenVersion),
    refreshToken: generateRefreshToken(subjectId, handle, userType, tokenVersion),
    expiresIn: ACCESS_TOKEN_EXPIRY
  };
}

/**
 * Check if token version matches (for invalidation)
 * SECURITY: Returns false if token was issued before password change
 */
export function isTokenVersionValid(decoded: DecodedToken, currentVersion: number): boolean {
  if (decoded.tokenVersion === undefined) return true; // Legacy tokens accepted
  return decoded.tokenVersion === currentVersion;
}

/**
 * Refresh token rotation - generate new pair and invalidate old
 * CRITICAL: Old refresh token must be invalidated in database
 * SECURITY: Preserves tokenVersion for continued validation
 */
export function rotateTokens(
  decoded: DecodedToken,
  tokenVersion?: number
): { accessToken: string; refreshToken: string; expiresIn: number } | null {
  if (!decoded.valid || decoded.tokenType !== 'refresh') {
    return null;
  }

  // Use provided tokenVersion or preserve from decoded token
  const version = tokenVersion ?? decoded.tokenVersion;
  return generateTokenPair(decoded.sub, decoded.handle, decoded.type, version);
}
