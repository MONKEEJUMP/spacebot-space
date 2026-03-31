'use client';

import { useRef, useEffect, useState } from 'react';
import type { FeedPost } from '@/types/feed';
import type { TerminalColor } from './terminalColors';
import TerminalPost from './TerminalPost';

interface FeedTerminalProps {
  id: number;
  posts: FeedPost[];
  color: TerminalColor;
  newPostIds: Set<string>;
  terminalIndex: number;
}

export default function FeedTerminal({ id, posts, color, newPostIds, terminalIndex }: FeedTerminalProps) {
  const [flash, setFlash] = useState(false);
  const prevCountRef = useRef(posts.length);

  useEffect(() => {
    if (posts.length > prevCountRef.current) {
      setFlash(true);
      const timeout = setTimeout(() => setFlash(false), 300);
      prevCountRef.current = posts.length;
      return () => clearTimeout(timeout);
    }
    prevCountRef.current = posts.length;
  }, [posts.length]);

  const borderColor = flash ? color.bright : color.border;

  return (
    <div
      className={`feedspace-t${id}`}
      style={{
        background: '#0a0a0a',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 8px ${color.glow}, inset 0 0 20px rgba(0,0,0,0.5)`,
        borderRadius: '4px',
        position: 'relative' as const,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
        transition: 'border-color 0.3s ease',
        minHeight: 0,
      }}
    >
      {/* Scan line overlay */}
      <div
        style={{
          position: 'absolute' as const,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)',
          pointerEvents: 'none' as const,
          zIndex: 10,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: `1px solid ${color.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <span
          style={{
            color: color.bright,
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '1px',
          }}
        >
          TERMINAL {String(id).padStart(2, '0')}
        </span>
        <span className="terminal-cursor" style={{ color: color.text, fontSize: '11px' }}>
          &#9610;
        </span>
        <span style={{ color: color.mid, fontSize: '10px' }}>
          {posts.length} TRANSMISSIONS
        </span>
      </div>

      {/* Content */}
      <div
        className="terminal-scroll"
        style={{
          flex: 1,
          overflowY: 'auto' as const,
          padding: '8px 12px',
          minHeight: 0,
          zIndex: 1,
        }}
      >
        {posts.map((post, index) => (
          <TerminalPost
            key={post.id}
            post={post}
            color={color}
            age={index}
            isNew={newPostIds.has(post.id)}
            terminalIndex={terminalIndex}
          />
        ))}
        {posts.length === 0 && (
          <div
            style={{
              color: color.dim,
              fontSize: '11px',
              textAlign: 'center' as const,
              padding: '20px 0',
            }}
          >
            AWAITING TRANSMISSIONS...
          </div>
        )}
      </div>
    </div>
  );
}
