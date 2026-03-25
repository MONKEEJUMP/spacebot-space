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
 * Strip ALL HTML tags from input
 * Uses regex-based approach (DOMPurify for browser, this for server)
 */
export function stripHtml(input: string): string {
  return input
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
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
