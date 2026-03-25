'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateBootSequence, type BootLine } from '@/lib/feed/boot-generator';
import { getWisdomQuotes } from '@/lib/feed/quotes-cache';

interface BootSequenceProps {
  onComplete: () => void;
}

export default function BootSequence({ onComplete }: Readonly<BootSequenceProps>) {
  const [visibleLines, setVisibleLines] = useState<BootLine[]>([]);
  const [bootLines, setBootLines] = useState<BootLine[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Initialize: fetch quotes and generate sequence
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const quotes = await getWisdomQuotes();
      if (cancelled) return;
      const sequence = generateBootSequence(quotes);
      setBootLines(sequence);
      setIsReady(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  // Run the boot animation at 120ms per line
  useEffect(() => {
    if (!isReady || bootLines.length === 0) return;

    const interval = setInterval(() => {
      const idx = indexRef.current;
      if (idx >= bootLines.length) {
        clearInterval(interval);
        // Hold 800ms, then fade out
        setTimeout(() => {
          setIsFading(true);
          // Fade takes 400ms, then complete
          setTimeout(() => {
            onCompleteRef.current();
          }, 400);
        }, 800);
        return;
      }
      setVisibleLines((prev) => [...prev, bootLines[idx]]);
      indexRef.current = idx + 1;
      scrollToBottom();
    }, 120);

    return () => clearInterval(interval);
  }, [isReady, bootLines, scrollToBottom]);

  // Scroll whenever lines update
  useEffect(() => {
    scrollToBottom();
  }, [visibleLines, scrollToBottom]);

  const getCategoryStyle = (category: BootLine['category']): React.CSSProperties => {
    switch (category) {
      case 'tech':
        return { color: 'var(--sb-accent)' };
      case 'bot':
        return { color: 'var(--sb-accent-light)' };
      case 'happy':
        return { color: 'var(--sb-accent)' };
      case 'wisdom':
        return { color: 'var(--sb-text-primary)', fontStyle: 'italic' };
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundColor: 'var(--sb-bg-primary)',
        transition: 'opacity 400ms ease-out',
        opacity: isFading ? 0 : 1,
      }}
    >
      <div
        ref={containerRef}
        className="max-w-2xl w-full mx-4 p-8 overflow-y-auto"
        style={{
          maxHeight: '80vh',
          border: '1px solid var(--sb-accent)',
          borderColor: 'color-mix(in srgb, var(--sb-accent) 40%, transparent)',
          boxShadow: 'var(--sb-glow)',
          backgroundColor: 'var(--sb-bg-secondary)',
          fontFamily: "'Glass TTY VT220', monospace",
        }}
      >
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className="text-sm mb-1 leading-relaxed"
            style={{
              ...getCategoryStyle(line.category),
              opacity: i < visibleLines.length - 1 ? 0.6 : 1,
              textShadow: 'var(--sb-glow)',
            }}
          >
            {line.text}
          </div>
        ))}
        {visibleLines.length > 0 && visibleLines.length < bootLines.length && (
          <span
            className="inline-block"
            style={{
              color: 'var(--sb-accent)',
              animation: 'pulse 1s ease-in-out infinite',
            }}
          >
            {'\u2588'}
          </span>
        )}
      </div>
    </div>
  );
}
