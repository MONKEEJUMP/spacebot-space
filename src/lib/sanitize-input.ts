/**
 * Sanitizes user/machine input before database insertion.
 * Strips dangerous HTML/JS while preserving markdown syntax.
 * Markdown preserved: **bold**, *italic*, # headings, [links], `code`, newlines
 */
export function sanitizeInput(text: string): string {
  // Strip <script> tags AND their content
  let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip <iframe>, <embed>, <object> tags AND their content
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/<embed\b[^>]*\/?>/gi, '');
  clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  // Strip remaining HTML tags (preserves text content, markdown unaffected)
  clean = clean.replace(/<[^>]*>/g, '');
  // Strip javascript: URIs
  clean = clean.replace(/javascript:/gi, '');
  // Strip data: URIs (except harmless text)
  clean = clean.replace(/data:\s*[^\s;,]+/gi, '');
  // Strip on* event handlers (onclick, onerror, onload, etc.)
  clean = clean.replace(/on\w+\s*=/gi, '');
  // Trim whitespace
  clean = clean.trim();
  return clean;
}
