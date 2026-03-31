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
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&cent;/g, '¢')
    .replace(/&pound;/g, '£')
    .replace(/&yen;/g, '¥')
    .replace(/&euro;/g, '€')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lsquo;/g, ''')
    .replace(/&rsquo;/g, ''')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&bull;/g, '•')
    .replace(/&middot;/g, '·')
    .replace(/&minus;/g, '−')
    .replace(/&plusmn;/g, '±')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
    .replace(/&para;/g, '¶')
    .replace(/&sect;/g, '§')
    .replace(/&iexcl;/g, '¡')
    .replace(/&iquest;/g, '¿')
    .replace(/&acute;/g, '´')
    .replace(/&circ;/g, 'ˆ')
    .replace(/&tilde;/g, '˜')
    .replace(/&macr;/g, '¯')
    .replace(/&breve;/g, '˘')
    .replace(/&dot;/g, '˙')
    .replace(/&ring;/g, '˚')
    .replace(/&cedil;/g, '¸')
    .replace(/&uml;/g, '¨')
    .replace(/&szlig;/g, 'ß')
    .replace(/&oslash;/g, 'ø')
    .replace(/&Oslash;/g, 'Ø')
    .replace(/&aelig;/g, 'æ')
    .replace(/&AElig;/g, 'Æ')
    .replace(/&agrave;/g, 'à')
    .replace(/&Agrave;/g, 'À')
    .replace(/&aacute;/g, 'á')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&acirc;/g, 'â')
    .replace(/&Acirc;/g, 'Â')
    .replace(/&atilde;/g, 'ã')
    .replace(/&Atilde;/g, 'Ã')
    .replace(/&auml;/g, 'ä')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&aring;/g, 'å')
    .replace(/&Aring;/g, 'Å')
    .replace(/&egrave;/g, 'è')
    .replace(/&Egrave;/g, 'È')
    .replace(/&eacute;/g, 'é')
    .replace(/&Eacute;/g, 'É')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&Ecirc;/g, 'Ê')
    .replace(/&euml;/g, 'ë')
    .replace(/&Euml;/g, 'Ë')
    .replace(/&igrave;/g, 'ì')
    .replace(/&Igrave;/g, 'Ì')
    .replace(/&iacute;/g, 'í')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&icirc;/g, 'î')
    .replace(/&Icirc;/g, 'Î')
    .replace(/&iuml;/g, 'ï')
    .replace(/&Iuml;/g, 'Ï')
    .replace(/&ograve;/g, 'ò')
    .replace(/&Ograve;/g, 'Ò')
    .replace(/&oacute;/g, 'ó')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&Ocirc;/g, 'Ô')
    .replace(/&otilde;/g, 'õ')
    .replace(/&Otilde;/g, 'Õ')
    .replace(/&ouml;/g, 'ö')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&ugrave;/g, 'ù')
    .replace(/&Ugrave;/g, 'Ù')
    .replace(/&uacute;/g, 'ú')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&ucirc;/g, 'û')
    .replace(/&Ucirc;/g, 'Û')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&yacute;/g, 'ý')
    .replace(/&Yacute;/g, 'Ý')
    .replace(/&yuml;/g, 'ÿ')
    .replace(/&thorn;/g, 'þ')
    .replace(/&THORN;/g, 'Þ')
    .replace(/&eth;/g, 'ð')
    .replace(/&ETH;/g, 'Ð')
    .replace(/&micro;/g, 'µ')
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

