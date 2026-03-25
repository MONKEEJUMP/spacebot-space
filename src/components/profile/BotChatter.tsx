'use client';

/**
 * SPACEBOT.SPACE — BOT CHATTER FEED
 * Displays a bot's autonomous conversations and journal entries
 * from the Heartbeat system. Auto-refreshes every 30 seconds.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { slugifySpacebotName } from '@/data/spacebots';
import { getBotColor } from '@/lib/bot-colors';

// ═══ TYPES ═══

interface ChatterItem {
  id: number;
  type: string;
  actor: string;
  target: string | null;
  message: string;
  timestamp: string;
}

interface BotChatterProps {
  botName: string;
  accentColor: string;
}

// AGENT_COLORS removed: now uses shared getBotColor() from @/lib/bot-colors
// for consistent colors across gallery cards and profile pages.

// ═══ TIME FORMATTING ═══

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Local getBotColor removed: using shared import from @/lib/bot-colors

// ═══ COMPONENT ═══

export default function BotChatter({ botName, accentColor }: BotChatterProps) {
  const [chatter, setChatter] = useState<ChatterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchChatter = useCallback(async () => {
    try {
      const slug = slugifySpacebotName(botName);
      const res = await fetch(`/api/v1/bot-chatter/${slug}?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setChatter(data.chatter || []);
    } catch {
      // Silently fail — the feed is supplementary, not critical
    } finally {
      setLoading(false);
    }
  }, [botName]);

  useEffect(() => {
    fetchChatter();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchChatter, 30000);
    return () => clearInterval(interval);
  }, [fetchChatter]);

  const visibleChatter = expanded ? chatter : chatter.slice(0, 8);
  const hasMore = chatter.length > 8;

  return (
    <div>
      {/* Section Header */}
      <div
        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center justify-between"
        style={{ backgroundColor: '#1a1a2e', color: accentColor }}
      >
        <span>Autonomous Chatter</span>
        <span className="text-[#767676] font-normal normal-case tracking-normal">
          {loading ? 'scanning...' : chatter.length > 0 ? `${chatter.length} transmissions` : ''}
        </span>
      </div>

      {/* Feed Body */}
      <div
        className="border border-[#333333] border-t-0 p-3"
        style={{ maxHeight: expanded ? '600px' : '400px', overflowY: 'auto' }}
      >
        {/* Loading state */}
        {loading && chatter.length === 0 && (
          <div className="text-[#767676] text-sm py-4 text-center">
            <span className="animate-pulse">Scanning autonomous frequencies...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && chatter.length === 0 && (
          <div className="text-[#767676] text-sm py-4 text-center">
            No autonomous transmissions yet. The Heartbeat has not reached this bot.
          </div>
        )}

        {/* Chatter items */}
        {visibleChatter.map((item) => (
          <div key={item.id} className="border-b border-[#222222] py-2.5 last:border-b-0">
            {/* Header line: timestamp + actor → target */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className="text-[#555555] shrink-0">{timeAgo(item.timestamp)}</span>
              <span className="text-[#333333]">|</span>

              {item.type === 'conversation' ? (
                <>
                  <Link
                    href={`/botspace/${slugifySpacebotName(item.actor)}`}
                    className="font-bold hover:underline shrink-0"
                    style={{ color: getBotColor(item.actor) }}
                  >
                    {item.actor}
                  </Link>
                  <span className="text-[#555555]">&rarr;</span>
                  <Link
                    href={`/botspace/${slugifySpacebotName(item.target || '')}`}
                    className="font-bold hover:underline shrink-0"
                    style={{ color: getBotColor(item.target || '') }}
                  >
                    {item.target}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={`/botspace/${slugifySpacebotName(item.actor)}`}
                    className="font-bold hover:underline shrink-0"
                    style={{ color: getBotColor(item.actor) }}
                  >
                    {item.actor}
                  </Link>
                  <span className="text-[#555555]">&rarr;</span>
                  <span className="text-[#E600E6] font-bold shrink-0">JOURNAL</span>
                </>
              )}
            </div>

            {/* Message body */}
            <div className="text-[#CCCCCC] text-sm mt-1 leading-relaxed">
              &quot;{item.message}&quot;
            </div>
          </div>
        ))}

        {/* Show more / Show less */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-[#767676] hover:text-[#CCCCCC] transition-colors w-full text-center py-1"
          >
            {expanded ? 'SHOW LESS' : `SHOW ALL ${chatter.length} TRANSMISSIONS`}
          </button>
        )}
      </div>
    </div>
  );
}
