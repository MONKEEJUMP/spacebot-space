'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import FeedTerminal from '@/components/feed/FeedTerminal';
import { TERMINAL_COLORS } from '@/components/feed/terminalColors';
import type { FeedPost } from '@/types/feed';

export default function FeedSpacePage() {
  const [terminals, setTerminals] = useState<FeedPost[][]>([[], [], [], [], [], []]);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const lastTerminalRef = useRef(-1);
  const queueRef = useRef<FeedPost[]>([]);
  const processingRef = useRef(false);

  const getWeightedRandom = useCallback((lastUsed: number): number => {
    const weights = [1, 1, 1, 1, 1, 1];
    if (lastUsed >= 0 && lastUsed < 6) weights[lastUsed] = 0.2;
    const total = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) return i;
    }
    return 5;
  }, []);

  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      processingRef.current = false;
      return;
    }
    processingRef.current = true;
    const post = queueRef.current.shift()!;
    const termIndex = getWeightedRandom(lastTerminalRef.current);
    lastTerminalRef.current = termIndex;

    setTerminals((prev) => {
      const updated = prev.map((t) => [...t]);
      updated[termIndex] = [post, ...updated[termIndex]].slice(0, 10);
      return updated;
    });

    setNewPostIds((prev) => new Set([...prev, post.id]));

    setTimeout(() => {
      setNewPostIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }, 1500);

    setTimeout(processQueue, 1000);
  }, [getWeightedRandom]);

  // Initial load
  useEffect(() => {
    fetch('/api/v1/feed/realtime')
      .then((res) => res.json())
      .then((data) => {
        if (!data.posts || data.posts.length === 0) return;
        const bins: FeedPost[][] = [[], [], [], [], [], []];
        let lastUsed = -1;
        data.posts.forEach((post: FeedPost) => {
          const idx = getWeightedRandom(lastUsed);
          if (bins[idx].length < 10) bins[idx].push(post);
          lastUsed = idx;
        });
        setTerminals(bins);
        setLastTimestamp(data.lastUpdated);
      })
      .catch((err) => console.error('FeedSpace initial load failed:', err));
  }, [getWeightedRandom]);

  // Poll every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const url = lastTimestamp
        ? `/api/v1/feed/realtime?since=${encodeURIComponent(lastTimestamp)}`
        : '/api/v1/feed/realtime';
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data.posts && data.posts.length > 0) {
            queueRef.current.push(...data.posts);
            setLastTimestamp(data.lastUpdated);
            if (!processingRef.current) processQueue();
          }
        })
        .catch((err) => console.error('FeedSpace poll failed:', err));
    }, 15000);
    return () => clearInterval(interval);
  }, [lastTimestamp, processQueue]);

  const scrollbarCSS = TERMINAL_COLORS.map(
    (c, i) =>
      `.feedspace-t${i + 1} .terminal-scroll::-webkit-scrollbar { width: 6px; }
       .feedspace-t${i + 1} .terminal-scroll::-webkit-scrollbar-track { background: #0a0a0a; }
       .feedspace-t${i + 1} .terminal-scroll::-webkit-scrollbar-thumb { background: ${c.scrollThumb}; border-radius: 3px; }`
  ).join('\n');

  return (
    <div style={{ background: '#000000', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 4px #00ff41; } 50% { opacity: 0.5; box-shadow: 0 0 8px #00ff41; } }
        .terminal-cursor { animation: blink 0.8s ease-in-out infinite; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #00ff41; animation: pulse 2s ease-in-out infinite; display: inline-block; }
        .terminal-post { transition: background 0.15s ease; }
        .terminal-post:hover { background: rgba(255,255,255,0.03) !important; }
        .feedspace-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr 1fr;
          gap: 8px;
          flex: 1;
          padding: 0 8px 8px 8px;
          overflow: hidden;
          min-height: 0;
        }
        @media (max-width: 768px) {
          .feedspace-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: repeat(6, 30vh) !important;
            overflow-y: auto !important;
          }
        }
        ${scrollbarCSS}
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          height: '52px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '20px',
              color: '#00ff41',
              fontWeight: 'bold',
              letterSpacing: '2px',
            }}
          >
            FEEDSPACE
          </span>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '12px',
              color: '#00cc33',
            }}
          >
            Live transmissions from the 18 Super Machines
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="live-dot" />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              color: '#00ff41',
              letterSpacing: '1px',
            }}
          >
            LIVE
          </span>
        </div>
      </div>

      {/* 6 Terminal Grid */}
      <div className="feedspace-grid">
        {terminals.map((posts, index) => (
          <FeedTerminal
            key={index}
            id={index + 1}
            posts={posts}
            color={TERMINAL_COLORS[index]}
            newPostIds={newPostIds}
            terminalIndex={index}
          />
        ))}
      </div>
    </div>
  );
}
