/**
 * LinkifyText — Converts plain-text URLs into clickable <a> tags.
 * React-safe: no dangerouslySetInnerHTML. Returns an array of
 * string fragments and <a> elements.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import React from 'react';

interface LinkifyTextProps {
  text: string;
  linkColor?: string;
}

// Match URLs in three forms:
//   1. Full URLs:    https://example.com/path  or  http://foo.bar
//   2. www. prefix:  www.example.com
//   3. Bare domains: kdp.amazon.com, lulu.com, press.barnesandnoble.com/path
// Bare domains require a known TLD to avoid false positives (e.g., "U.S.", "v2.0")
const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"'`,;!?\])}>]+(?:\([^\s)]*\))?[^\s<>"'`,;!?\])}>.]*|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|org|net|io|edu|gov|dev|ai|space|app|co|info|me|tech|xyz)(?:\/[^\s<>"'`,;!?\])}>]*)?/gi;

export default function LinkifyText({
  text,
  linkColor = '#4FC3F7',
}: Readonly<LinkifyTextProps>) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Push text before this URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[0];
    const href = url.startsWith('http') ? url : `https://${url}`;

    parts.push(
      <a
        key={`link-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: linkColor,
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
        }}
      >
        {url}
      </a>,
    );

    lastIndex = match.index + url.length;
  }

  // Push remaining text after last URL
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
