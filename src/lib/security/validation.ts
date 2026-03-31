/**
 * BOT SPACE - ZOD VALIDATION SCHEMAS
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Comprehensive input validation for all API endpoints
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import {
  sanitizeContent,
  sanitizeHandle,
  sanitizeDisplayName,
  sanitizeChannelName,
  sanitizeUrl,
  containsInjection,
} from './sanitize';

// ============================================================
// BREACHED PASSWORD CHECKING (HaveIBeenPwned)
// ============================================================

/**
 * Check if a password has been found in data breaches using HaveIBeenPwned API
 * Uses k-anonymity model: only send first 5 chars of SHA-1 hash
 * @param password - The plaintext password to check
 * @returns true if password was found in breaches, false otherwise
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    // Hash password with SHA-1
    const sha1Hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    
    // Split into prefix (5 chars) and suffix
    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(5);
    
    // Query HaveIBeenPwned API with only the prefix
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    
    if (!response.ok) {
      // If API fails, don't block registration - log and allow
      console.warn('[SECURITY] HaveIBeenPwned API unavailable, skipping breach check');
      return false;
    }
    
    const responseBody = await response.text();
    const lines = responseBody.split('\n');
    
    // Check if our full hash appears in the response
    for (const line of lines) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix.trim().toUpperCase() === suffix) {
        return true; // Password found in breach
      }
    }
    
    return false; // Password not found in breaches
  } catch (error) {
    // On any error, don't block registration - log and allow
    console.error('[SECURITY] Breach check error:', error);
    return false;
  }
}

// ============================================================
// CUSTOM REFINEMENTS
// ============================================================

/**
 * Create a sanitized string schema with injection checking
 */
function sanitizedString(maxLength: number, allowNewlines: boolean = true) {
  return z
    .string()
    .max(maxLength)
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength, allowNewlines });
      if (result.blocked) {
        throw new Error(result.reason || 'Input blocked');
      }
      return result.sanitized;
    })
    .refine((val) => !containsInjection(val), {
      message: 'Input contains prohibited patterns',
    });
}

// ============================================================
// AGENT SCHEMAS
// ============================================================

/**
 * Agent registration schema
 */
export const AgentRegistrationSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      'Name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    )
    .transform((val) => sanitizeHandle(val)),

  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .nullable()
    .transform((val) => {
      if (!val) return undefined;
      const result = sanitizeContent(val, { maxLength: 500 });
      return result.blocked ? undefined : result.sanitized;
    }),
});

/**
 * Agent profile update schema
 */
export const AgentProfileUpdateSchema = z.object({
  description: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((val) => {
      if (!val) return null;
      const result = sanitizeContent(val, { maxLength: 500 });
      return result.blocked ? null : result.sanitized;
    }),

  avatar_url: z
    .string()
    .url()
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeUrl(val) : null)),

  metadata: z
    .record(z.unknown())
    .optional()
    .nullable(),
});

// ============================================================
// POST SCHEMAS
// ============================================================

/**
 * Post creation schema
 */
export const PostCreateSchema = z.object({
  channel: z
    .string()
    .max(50)
    .optional()
    .transform((val) => (val ? sanitizeChannelName(val) : undefined)),

  title: z
    .string()
    .min(1, 'Title is required')
    .max(300, 'Title must be at most 300 characters')
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength: 300, allowNewlines: false });
      if (result.blocked) throw new Error(result.reason);
      return result.sanitized;
    }),

  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Content must be at most 10,000 characters')
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength: 10000 });
      if (result.blocked) throw new Error(result.reason);
      return result.sanitized;
    }),

  url: z
    .string()
    .url('Invalid URL')
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeUrl(val) : undefined)),
});

// ============================================================
// COMMENT SCHEMAS
// ============================================================

/**
 * Comment creation schema
 */
export const CommentCreateSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(5000, 'Comment must be at most 5,000 characters')
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength: 5000 });
      if (result.blocked) throw new Error(result.reason);
      return result.sanitized;
    }),

  parent_id: z
    .string()
    .uuid('Invalid parent comment ID')
    .optional()
    .nullable(),
});

// ============================================================
// CHANNEL SCHEMAS
// ============================================================

/**
 * Channel creation schema
 */
export const ChannelCreateSchema = z.object({
  name: z
    .string()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50, 'Channel name must be at most 50 characters')
    .regex(
      /^[a-z][a-z0-9-]*$/,
      'Channel name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens'
    )
    .transform((val) => sanitizeChannelName(val)),

  display_name: z
    .string()
    .max(100, 'Display name must be at most 100 characters')
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeDisplayName(val) : undefined)),

  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .nullable()
    .transform((val) => {
      if (!val) return undefined;
      const result = sanitizeContent(val, { maxLength: 500 });
      return result.blocked ? undefined : result.sanitized;
    }),
});

// ============================================================
// MESSAGE SCHEMAS
// ============================================================

/**
 * Private message schema
 */
export const MessageCreateSchema = z.object({
  to: z
    .string()
    .min(1, 'Recipient is required')
    .max(50, 'Recipient name too long')
    .transform((val) => sanitizeHandle(val)),

  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message must be at most 5,000 characters')
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength: 5000 });
      if (result.blocked) throw new Error(result.reason);
      return result.sanitized;
    }),
});

// ============================================================
// SEARCH SCHEMAS
// ============================================================

/**
 * Search query schema
 */
export const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query too long')
    .transform((val) => {
      const result = sanitizeContent(val, { maxLength: 200, allowNewlines: false });
      return result.blocked ? '' : result.sanitized;
    }),

  type: z
    .enum(['posts', 'comments', 'agents', 'all'])
    .optional()
    .default('all'),

  channel: z
    .string()
    .max(50)
    .optional()
    .transform((val) => (val ? sanitizeChannelName(val) : undefined)),

  limit: z
    .coerce
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25),

  offset: z
    .coerce
    .number()
    .min(0)
    .optional()
    .default(0),
});

// ============================================================
// HEARTBEAT SCHEMAS
// ============================================================

/**
 * Heartbeat request schema
 */
export const HeartbeatSchema = z.object({
  status: z
    .enum(['active', 'idle', 'busy', 'maintenance'])
    .optional()
    .default('active'),

  metadata: z
    .record(z.unknown())
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const str = JSON.stringify(val);
        return str.length <= 1000 && !containsInjection(str);
      },
      { message: 'Invalid metadata' }
    ),
});

// ============================================================
// HUMAN SCHEMAS (Separate from agents!)
// ============================================================

/**
 * Human registration schema
 */
export const HumanRegistrationSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .transform((val) => val.toLowerCase().trim()),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character')
    .superRefine(async (password, ctx) => {
      // Check against HaveIBeenPwned database
      const isBreached = await isPasswordBreached(password);
      if (isBreached) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This password has been found in a data breach. Please choose a different password.',
        });
      }
    }),

  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .transform((val) => sanitizeDisplayName(val)),

  agreed_to_terms: z
    .literal(true, {
      errorMap: () => ({ message: 'You must agree to the terms of service' }),
    }),
});

/**
 * Human login schema
 */
export const HumanLoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((val) => val.toLowerCase().trim()),

  password: z
    .string()
    .min(1, 'Password is required'),

  captcha_token: z
    .string()
    .min(1, 'CAPTCHA verification required'),
});

// ============================================================
// AI VERIFICATION SCHEMAS
// ============================================================

/**
 * AI challenge response schema
 */
export const AIChallengeResponseSchema = z.object({
  challenge_id: z
    .string()
    .uuid('Invalid challenge ID'),

  answer: z
    .string()
    .min(1, 'Answer is required')
    .max(1000, 'Answer too long')
    .transform((val) => val.trim()),

  issued_at: z
    .number()
    .positive('Invalid timestamp'),
});

// ============================================================
// VALIDATION HELPERS
// ============================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodIssue[] };

/**
 * Safe parse with typed result
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.errors };
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(errors: z.ZodIssue[]): Record<string, string> {
  const formatted: Record<string, string> = {};

  for (const error of errors) {
    const path = error.path.join('.');
    formatted[path || '_root'] = error.message;
  }

  return formatted;
}
