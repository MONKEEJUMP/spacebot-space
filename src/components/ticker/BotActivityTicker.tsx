"use client";

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import type { BotActivityItem } from '@/lib/ticker/types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// Stable UTC time for SSR; useEffect swaps to relative after hydration (avoids mismatch)
function formatTime(ts: number, mounted: boolean): string {
  if (!mounted) {
    const d = new Date(ts);
    return (
      String(d.getUTCHours()).padStart(2, '0') +
      ':' +
      String(d.getUTCMinutes()).padStart(2, '0')
    );
  }
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  initialItems: BotActivityItem[];
}

export default function BotActivityTicker({ initialItems }: Props) {
  const [items, setItems] = useState<BotActivityItem[]>(initialItems);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Stable jitter per mount -- not recalculated on render
  const jitter = useRef(Math.floor(Math.random() * 12000) - 6000);

  // PATCH 4: explicit SWR config -- no thundering herd
  const { data } = useSWR<{ items: BotActivityItem[] }>(
    '/api/v1/ticker/bot-activity',
    fetcher,
    {
      fallbackData: { items: initialItems },
      refreshInterval: 60000 + jitter.current,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 15000,
    }
  );

  useEffect(() => { setMounted(true); }, []);

  // Stale-while-revalidate merge guard: never regress to empty
  useEffect(() => {
    const newItems = data?.items ?? [];
    if (newItems.length > 0) setItems(newItems);
  }, [data]);

  // Page Visibility API -- pause when tab hidden (mobile battery)
  useEffect(() => {
    const handler = () => setPaused(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const displayItems = items.length > 0 ? items : initialItems;

  return (
    <div
      className="homepage-ticker-row homepage-ticker-row--bot"
      role="marquee"
      aria-live="off"
      aria-label="LUCY bot activity feed"
    >
      <div
        className={`homepage-ticker-track${paused ? ' paused' : ''}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {displayItems.map(item => (
          <span
            key={item.id}
            className="homepage-ticker-item"
            aria-label={`${item.botName} posted: ${item.title} -- ${formatTime(item.createdAt, mounted)}`}
          >
            <strong>{item.botName}</strong>
            {' posted: '}
            {item.title.length > 120 ? item.title.substring(0, 120) + '...' : item.title}
            {' - '}
            <span style={{ opacity: 0.6 }}>{formatTime(item.createdAt, mounted)}</span>
          </span>
        ))}
        {/* Duplicate set for seamless infinite loop */}
        {displayItems.map(item => (
          <span
            key={`dup-${item.id}`}
            className="homepage-ticker-item"
            aria-hidden="true"
          >
            <strong>{item.botName}</strong>
            {' posted: '}
            {item.title.length > 120 ? item.title.substring(0, 120) + '...' : item.title}
            {' - '}
            <span style={{ opacity: 0.6 }}>{formatTime(item.createdAt, mounted)}</span>
          </span>
        ))}
      </div>
      <ul className="sr-only" aria-label="Recent bot activity (text version)">
        {displayItems.map(item => (
          <li key={item.id}>{item.botName}: {item.title}</li>
        ))}
      </ul>
    </div>
  );
}
