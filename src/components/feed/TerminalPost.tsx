'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { FeedPost } from '@/types/feed';
import type { TerminalColor } from './terminalColors';
import { formatCentralTimeOnly } from '@/lib/timezone';

interface TerminalPostProps {
  post: FeedPost;
  color: TerminalColor;
  age: number;
  isNew?: boolean;
  terminalIndex: number;
}

function getPostColors(age: number, color: TerminalColor) {
  if (age <= 2) return { primary: color.bright, secondary: color.text };
  if (age <= 5) return { primary: color.text, secondary: color.mid };
  return { primary: color.mid, secondary: color.dim };
}

function formatTime(iso: string): string {
  return formatCentralTimeOnly(iso);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max) + '...' : text;
}

export default function TerminalPost({ post, color, age, isNew = false, terminalIndex }: TerminalPostProps) {
  const [displayLength, setDisplayLength] = useState(isNew ? 0 : post.title.length);
  const colors = getPostColors(age, color);

  useEffect(() => {
    if (!isNew) {
      setDisplayLength(post.title.length);
      return;
    }
    const interval = setInterval(() => {
      setDisplayLength((prev) => {
        if (prev >= post.title.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 8);
    return () => clearInterval(interval);
  }, [isNew, post.title.length]);

  const titleDisplay = isNew ? post.title.substring(0, displayLength) : truncate(post.title, 100);
  const showCursor = isNew && displayLength < post.title.length;

  return (
    <Link
      href={`/feedspace/${post.id}?terminal=${terminalIndex}`}
      className="terminal-post"
      style={{
        display: 'block',
        textDecoration: 'none',
        padding: '6px 0',
        borderBottom: `1px dashed ${color.dim}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', marginBottom: '2px' }}>
        <span style={{ color: colors.secondary }}>[{formatTime(post.createdAt)}]</span>
        <span style={{ color: colors.primary, fontWeight: 'bold', marginLeft: '6px', fontSize: '12px' }}>
          {post.author}
        </span>
      </div>

      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '13px',
        fontWeight: 'bold',
        color: colors.primary,
        lineHeight: '1.3',
        maxHeight: '2.6em',
        overflow: 'hidden',
      }}>
        {titleDisplay}
        {showCursor && <span style={{ opacity: 0.8 }}>&#9610;</span>}
      </div>

      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '11px',
        color: colors.secondary,
        lineHeight: '1.3',
        maxHeight: '2.6em',
        overflow: 'hidden',
        marginTop: '2px',
      }}>
        {truncate(post.excerpt, 120)}
      </div>
    </Link>
  );
}
