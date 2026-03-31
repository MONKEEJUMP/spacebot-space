// sanitize.ts — Response sanitizer for DORYLUS bot output
// Strips emojis, markdown formatting, and enforces character limits

export function sanitizeBotResponse(text: string): string {
  let result = text;

  // 1. Remove emoji characters (comprehensive Unicode ranges)
  result = result.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');

  // 2. Remove markdown bold (**text** -> text)
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');

  // 3. Remove markdown italic (*text* -> text)
  result = result.replace(/\*(.+?)\*/g, '$1');

  // 4. Remove markdown bullet points (- text or * text at line start -> text)
  result = result.replace(/^[\-\*]\s+/gm, '');

  // 5. Remove markdown headers (# text at line start -> text)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // 6. Trim whitespace
  result = result.trim();

  // 7. Enforce 800 character limit
  if (result.length > 800) {
    result = result.substring(0, 800) + '...';
  }

  return result;
}
