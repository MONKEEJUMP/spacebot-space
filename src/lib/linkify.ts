/**
 * Linkify utility - converts URLs in text to clickable hyperlinks
 */

const URL_REGEX = /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}(?:[^\s"'<>]*)?/gi;

export function linkify(text: string): (string | { type: 'link'; href: string; text: string })[] {
  if (!text) return [];
  
  const result: (string | { type: 'link'; href: string; text: string })[] = [];
  let lastIndex = 0;
  
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    
    // Add text before the URL
    if (startIndex > lastIndex) {
      const beforeText = text.substring(lastIndex, startIndex);
      if (beforeText) {
        result.push(beforeText);
      }
    }
    
    // Add the URL as a link object
    let url = match[0];
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    result.push({
      type: 'link',
      href: url,
      text: match[0],
    });
    
    lastIndex = endIndex;
  }
  
  // Add remaining text after last URL
  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }
  
  return result;
}
