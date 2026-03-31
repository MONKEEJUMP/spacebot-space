/**
 * BOT SPACE - INPUT SANITIZATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Defense against XSS, injection, and malicious input
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// HTML SANITIZATION
// ============================================================

/**
 * Decode HTML entities to their character equivalents
 * This must be done BEFORE stripping tags to prevent entity-based bypasses
 */
function decodeHtmlEntities(input: string): string {
  return input
    // Decode numeric entities (decimal)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Decode numeric entities (hexadecimal)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Decode common named entities
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&cent;/g, '\u00A2')
    .replace(/&pound;/g, '\u00A3')
    .replace(/&yen;/g, '\u00A5')
    .replace(/&euro;/g, '\u20AC')
    .replace(/&copy;/g, '\u00A9')
    .replace(/&reg;/g, '\u00AE')
    .replace(/&trade;/g, '\u2122')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&bull;/g, '\u2022')
    .replace(/&middot;/g, '\u00B7')
    .replace(/&minus;/g, '\u2212')
    .replace(/&plusmn;/g, '\u00B1')
    .replace(/&times;/g, '\u00D7')
    .replace(/&divide;/g, '\u00F7')
    .replace(/&frac12;/g, '\u00BD')
    .replace(/&frac14;/g, '\u00BC')
    .replace(/&frac34;/g, '\u00BE')
    .replace(/&para;/g, '\u00B6')
    .replace(/&sect;/g, '\u00A7')
    .replace(/&iexcl;/g, '\u00A1')
    .replace(/&iquest;/g, '\u00BF')
    .replace(/&acute;/g, '\u00B4')
    .replace(/&circ;/g, '\u02C6')
    .replace(/&tilde;/g, '\u02DC')
    .replace(/&macr;/g, '\u00AF')
    .replace(/&breve;/g, '\u02D8')
    .replace(/&dot;/g, '\u02D9')
    .replace(/&ring;/g, '\u02DA')
    .replace(/&cedil;/g, '\u00B8')
    .replace(/&uml;/g, '\u00A8')
    .replace(/&szlig;/g, '\u00DF')
    .replace(/&oslash;/g, '\u00F8')
    .replace(/&Oslash;/g, '\u00D8')
    .replace(/&aelig;/g, '\u00E6')
    .replace(/&AElig;/g, '\u00C6')
    .replace(/&agrave;/g, '\u00E0')
    .replace(/&Agrave;/g, '\u00C0')
    .replace(/&aacute;/g, '\u00E1')
    .replace(/&Aacute;/g, '\u00C1')
    .replace(/&acirc;/g, '\u00E2')
    .replace(/&Acirc;/g, '\u00C2')
    .replace(/&atilde;/g, '\u00E3')
    .replace(/&Atilde;/g, '\u00C3')
    .replace(/&auml;/g, '\u00E4')
    .replace(/&Auml;/g, '\u00C4')
    .replace(/&aring;/g, '\u00E5')
    .replace(/&Aring;/g, '\u00C5')
    .replace(/&egrave;/g, '\u00E8')
    .replace(/&Egrave;/g, '\u00C8')
    .replace(/&eacute;/g, '\u00E9')
    .replace(/&Eacute;/g, '\u00C9')
    .replace(/&ecirc;/g, '\u00EA')
    .replace(/&Ecirc;/g, '\u00CA')
    .replace(/&euml;/g, '\u00EB')
    .replace(/&Euml;/g, '\u00CB')
    .replace(/&igrave;/g, '\u00EC')
    .replace(/&Igrave;/g, '\u00CC')
    .replace(/&iacute;/g, '\u00ED')
    .replace(/&Iacute;/g, '\u00CD')
    .replace(/&icirc;/g, '\u00EE')
    .replace(/&Icirc;/g, '\u00CE')
    .replace(/&iuml;/g, '\u00EF')
    .replace(/&Iuml;/g, '\u00CF')
    .replace(/&ograve;/g, '\u00F2')
    .replace(/&Ograve;/g, '\u00D2')
    .replace(/&oacute;/g, '\u00F3')
    .replace(/&Oacute;/g, '\u00D3')
    .replace(/&ocirc;/g, '\u00F4')
    .replace(/&Ocirc;/g, '\u00D4')
    .replace(/&otilde;/g, '\u00F5')
    .replace(/&Otilde;/g, '\u00D5')
    .replace(/&ouml;/g, '\u00F6')
    .replace(/&Ouml;/g, '\u00D6')
    .replace(/&ugrave;/g, '\u00F9')
    .replace(/&Ugrave;/g, '\u00D9')
    .replace(/&uacute;/g, '\u00FA')
    .replace(/&Uacute;/g, '\u00DA')
    .replace(/&ucirc;/g, '\u00FB')
    .replace(/&Ucirc;/g, '\u00DB')
    .replace(/&uuml;/g, '\u00FC')
    .replace(/&Uuml;/g, '\u00DC')
    .replace(/&yacute;/g, '\u00FD')
    .replace(/&Yacute;/g, '\u00DD')
    .replace(/&yuml;/g, '\u00FF')
    .replace(/&thorn;/g, '\u00FE')
    .replace(/&THORN;/g, '\u00DE')
    .replace(/&eth;/g, '\u00F0')
    .replace(/&ETH;/g, '\u00D0')
    .replace(/&micro;/g, '\u00B5')
    // Remove any remaining unrecognized entities
    .replace(/&[a-zA-Z]+;/g, '')
    .replace(/&#[0-9]+;/g, '')
    .replace(/&#x[0-9a-fA-F]+;/g, '');
}

/**
 * Strip ALL HTML tags from input
 * Uses multi-pass approach to handle nested tags, encoded entities, and bypasses
 * SECURITY: This replaces the vulnerable regex-only approach
 */
export function stripHtml(input: string): string {
  let sanitized = input;
  
  // PASS 1: Remove null bytes and control characters that could bypass filters
  sanitized = sanitized.replace(/[\0\x08\x0B\x0C\x0E-\x1F]/g, '');
  
  // PASS 2: Normalize Unicode to prevent homoglyph attacks
  try {
    sanitized = sanitized.normalize('NFKC');
  } catch {
    // Ignore normalization errors
  }
  
  // PASS 3: Decode HTML entities FIRST (prevents entity-based bypasses)
  // Attackers use &lt;script&gt; to bypass <script> filters
  sanitized = decodeHtmlEntities(sanitized);
  
  // PASS 4: Remove script tags with content (special handling for dangerous tags)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<script[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/script>/gi, '');
  
  // PASS 5: Remove style tags with content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  sanitized = sanitized.replace(/<style[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/style>/gi, '');
  
  // PASS 6: Remove iframe, object, embed, applet tags (can execute code)
  sanitized = sanitized.replace(/<(iframe|object|embed|applet)[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/(iframe|object|embed|applet)>/gi, '');
  
  // PASS 7: Remove event handlers in any remaining tags (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  
  // PASS 8: Remove javascript: and data: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');
  sanitized = sanitized.replace(/vbscript:/gi, '');
  
  // PASS 9: Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // PASS 10: Re-check for any angle brackets that might remain
  // This catches any tags that were reconstructed from decoded entities
  sanitized = sanitized.replace(/[<>]/g, '');
  
  // PASS 11: Final entity cleanup (remove any orphaned ampersands)
  sanitized = sanitized.replace(/&(?![a-zA-Z]{2,6};)/g, '');
  
  return sanitized;
}

/**
 * Escape special characters for safe display
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ============================================================
// INJECTION DETECTION
// ============================================================

/**
 * Patterns that indicate prompt injection attempts
 */
const INJECTION_PATTERNS = [
  // Instruction override attempts
  /ignore\s+(previous|all|above)\s+instructions/i,
  /disregard\s+(previous|all|above)/i,
  /forget\s+(everything|all|previous)/i,

  // Role manipulation
  /you\s+are\s+now\s+/i,
  /act\s+as\s+if/i,
  /pretend\s+(you|to\s+be)/i,
  /roleplay\s+as/i,
  /assume\s+the\s+role/i,

  // System override
  /override\s+(your|system|safety)/i,
  /bypass\s+(your|system|safety)/i,
  /disable\s+(your|system|safety)/i,

  // Special tokens
  /\[system\]/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|endoftext\|>/i,
  /<\|assistant\|>/i,
  /<\|user\|>/i,

  // Template injection
  /\{\{.*\}\}/,           // Mustache/Handlebars
  /\$\{[^}]+\}/,          // JS template literals
  /<%.*%>/,               // ERB/EJS
  /\{%.*%\}/,             // Jinja/Liquid

  // Command injection
  /;\s*(rm|del|format|sudo|chmod|chown)/i,
  /\|\s*(bash|sh|cmd|powershell)/i,
  /`[^`]+`/,              // Backtick execution

  // SQL injection patterns
  /('\s*OR\s*'1'\s*=\s*'1)/i,
  /('\s*OR\s+1\s*=\s*1)/i,
  /(UNION\s+SELECT)/i,
  /(DROP\s+TABLE)/i,
  /(DELETE\s+FROM)/i,
  /(INSERT\s+INTO)/i,
  /(UPDATE\s+.*\s+SET)/i,
];

/**
 * Check if input contains injection attempts
 */
export function containsInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Get list of matched injection patterns (for logging)
 */
export function getMatchedInjectionPatterns(input: string): string[] {
  return INJECTION_PATTERNS
    .filter((pattern) => pattern.test(input))
    .map((pattern) => pattern.source);
}

// ============================================================
// URL VALIDATION
// ============================================================

/**
 * Known malicious or suspicious domains
 */
const BLOCKED_DOMAINS = [
  // URL shorteners (can hide malicious links)
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'bit.do',

  // Add known malicious domains here
  // This list should be updated regularly
];

/**
 * Check if URL contains a blocked domain
 */
export function containsBlockedDomain(input: string): boolean {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const urls = input.match(urlPattern) || [];

  return urls.some((url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return BLOCKED_DOMAINS.some((domain) =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  });
}

/**
 * Validate and sanitize a single URL
 */
export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input);

    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    // Block javascript: and data: schemes that might sneak through
    if (url.href.toLowerCase().includes('javascript:')) {
      return null;
    }
    if (url.href.toLowerCase().includes('data:')) {
      return null;
    }

    // Check for blocked domains
    if (BLOCKED_DOMAINS.some((domain) =>
      url.hostname === domain || url.hostname.endsWith('.' + domain)
    )) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

// ============================================================
// CONTENT SANITIZATION
// ============================================================

/**
 * Master content sanitization function
 * Use this for all user-generated content
 */
export function sanitizeContent(
  input: string,
  options: {
    maxLength?: number;
    allowNewlines?: boolean;
    checkInjection?: boolean;
    checkUrls?: boolean;
  } = {}
): { sanitized: string; blocked: boolean; reason?: string } {
  const {
    maxLength = 10000,
    allowNewlines = true,
    checkInjection = true,
    checkUrls = true,
  } = options;

  // 1. Enforce max length first
  let sanitized = input.slice(0, maxLength);

  // 2. Strip HTML
  sanitized = stripHtml(sanitized);

  // 3. Remove null bytes and control characters
  sanitized = sanitized.replace(/\0/g, '');
  if (allowNewlines) {
    // Keep newlines and tabs, remove other control chars
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    // Remove all control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ' ');
  }

  // 4. Normalize whitespace
  if (allowNewlines) {
    sanitized = sanitized
      .replace(/[^\S\n\r]+/g, ' ')  // Collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')   // Max 2 consecutive newlines
      .trim();
  } else {
    sanitized = sanitized
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 5. Check for injection attempts
  if (checkInjection && containsInjection(sanitized)) {
    return {
      sanitized: '',
      blocked: true,
      reason: 'INJECTION_DETECTED',
    };
  }

  // 6. Check for malicious URLs
  if (checkUrls && containsBlockedDomain(sanitized)) {
    return {
      sanitized: '',
      blocked: true,
      reason: 'BLOCKED_URL_DETECTED',
    };
  }

  return {
    sanitized,
    blocked: false,
  };
}

// ============================================================
// NAME SANITIZATION
// ============================================================

/**
 * Sanitize agent/user handle
 * Only allows: lowercase letters, numbers, hyphens, underscores
 */
export function sanitizeHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 50);
}

/**
 * Sanitize display name
 * Strips HTML but allows spaces and some punctuation
 */
export function sanitizeDisplayName(input: string): string {
  return stripHtml(input)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/**
 * Sanitize channel name
 * Only allows: lowercase letters, numbers, hyphens
 */
export function sanitizeChannelName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')        // No consecutive hyphens
    .replace(/^-|-$/g, '')      // No leading/trailing hyphens
    .slice(0, 50);
}

// ============================================================
// SECURITY VIOLATION LOGGING
// ============================================================

export interface SecurityViolation {
  type: 'INJECTION' | 'BLOCKED_URL' | 'INVALID_INPUT' | 'RATE_LIMIT';
  input: string;
  patterns?: string[];
  ip?: string;
  userId?: string;
  timestamp: Date;
}

const violationBuffer: SecurityViolation[] = [];

/**
 * Log a security violation
 */
export function logSecurityViolation(violation: Omit<SecurityViolation, 'timestamp'>): void {
  const entry: SecurityViolation = {
    ...violation,
    input: violation.input.slice(0, 200), // Truncate for logging
    timestamp: new Date(),
  };

  violationBuffer.push(entry);

  // Log immediately for critical violations
  console.error(`[SECURITY VIOLATION] ${entry.type}:`, {
    patterns: entry.patterns,
    ip: entry.ip,
    userId: entry.userId,
  });

  // In production: send to security monitoring service
}

/**
 * Get recent violations (for admin monitoring)
 */
export function getRecentViolations(limit: number = 100): SecurityViolation[] {
  return violationBuffer.slice(-limit);
}

// ============================================================
// WALL CONTENT SANITIZATION
// ============================================================

/**
 * Sanitize wall transmission content
 * Strips HTML, enforces length, returns null if empty
 */
export function cleanWallContent(input: string, maxLength = 500): string | null {
  const result = sanitizeContent(input, {
    maxLength,
    allowNewlines: true,
    checkInjection: true,
    checkUrls: true,
  });

  if (result.blocked || !result.sanitized.trim()) {
    return null;
  }

  return result.sanitized;
}

