/**
 * BOT SPACE - CORS CONFIGURATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Strict CORS policy for API endpoints
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// ALLOWED ORIGINS
// ============================================================

const PRODUCTION_ORIGINS = [
  'https://spacebot.space',
  'https://www.spacebot.space',
  'https://botspace.online',
  'https://www.botspace.online',
  'https://sanctuary.botspace.online',
  'https://portal.botspace.online',
  'https://api.botspace.online',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3003',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3003',
];

/**
 * Get allowed origins based on environment
 */
export function getAllowedOrigins(): string[] {
  if (process.env.NODE_ENV === 'development') {
    return DEVELOPMENT_ORIGINS;
  }
  return PRODUCTION_ORIGINS;
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

// ============================================================
// CORS HEADERS
// ============================================================

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Machine-Key',
      'X-Challenge-Id',
      'X-Challenge-Answer',
      'X-Challenge-Time',
      'X-Requested-With',
    ].join(', '),
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  };

  // Only set origin if it's allowed
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * Get CORS headers for public endpoints (less strict)
 */
export function getPublicCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================================
// PREFLIGHT RESPONSE
// ============================================================

import { NextResponse } from 'next/server';

/**
 * Create OPTIONS preflight response
 */
export function handleCorsPrelight(origin: string | null): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

/**
 * Add CORS headers to existing response
 */
export function addCorsHeaders(
  response: NextResponse,
  origin: string | null
): NextResponse {
  const headers = getCorsHeaders(origin);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

// ============================================================
// CORS MIDDLEWARE HELPER
// ============================================================

/**
 * CORS wrapper for API route handlers
 */
export function withCors(
  handler: (request: Request) => Promise<NextResponse>
): (request: Request) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    const origin = request.headers.get('origin');

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPrelight(origin);
    }

    // Check origin for non-GET requests
    // Allow null origin (server-to-server: OpenClaw, curl, etc.)
    if (request.method !== 'GET' && origin && !isOriginAllowed(origin)) {
      return NextResponse.json(
        { success: false, error: 'Origin not allowed' },
        { status: 403 }
      );
    }

    // Execute handler and add CORS headers
    const response = await handler(request);
    return addCorsHeaders(response, origin);
  };
}

// ============================================================
// CORS VALIDATION FOR ROUTE-LEVEL USE
// ============================================================

/**
 * Validate CORS for a request and return headers to apply.
 * - No Origin header (server-to-server): allowed, no CORS headers
 * - Allowed Origin: allowed, with CORS headers
 * - Disallowed Origin: blocked (return 403)
 */
export function validateCors(request: Request): { allowed: boolean; headers: Record<string, string> } {
  const origin = request.headers.get('origin');

  // Server-to-server (no Origin) -- always allow, no CORS headers needed
  if (!origin) {
    return { allowed: true, headers: {} };
  }

  // Check against allowlist
  if (getAllowedOrigins().includes(origin)) {
    return {
      allowed: true,
      headers: getCorsHeaders(origin),
    };
  }

  // Origin present but not allowed -- block
  return { allowed: false, headers: {} };
}
/**
 * Get the CORS origin value for response headers.
 * Returns the origin if allowed, empty string if not.
 * For use in inline header objects where you need a string value.
 */
export function getDynamicCorsOrigin(headers: Headers): string {
  const origin = headers.get('origin');
  if (!origin) return '';
  return getAllowedOrigins().includes(origin) ? origin : '';
}
