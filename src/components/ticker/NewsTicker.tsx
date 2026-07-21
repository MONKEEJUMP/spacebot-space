"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsHeadlineItem, CategoryKey } from "@/lib/ticker/types";
import type { TickerHeadline } from "@/lib/ticker/types";

function toNewsItem(h: TickerHeadline): NewsHeadlineItem {
  const catMap: Record<string, CategoryKey> = {
    ai: "Ai", tech: "Tech", culture: "Culture",
    science: "Science", business: "Business", society: "Society",
    world: "Tech",
  };
  return {
    type: "news-headline",
    id: h.id,
    title: h.title,
    source: h.sourceName,
    category: catMap[h.category?.toLowerCase()] ?? "Tech",
    url: h.articleUrl,
    publishedAt: h.publishedAt ? new Date(h.publishedAt).getTime() : Date.now(),
    isBreaking: h.isBreaking,
  };
}

function fisherYatesShuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface NewsTickerProps {
  initialItems: NewsHeadlineItem[];
  variant?: "primary" | "secondary";
  isPaused?: boolean;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function renderItems(
  items: NewsHeadlineItem[],
  keyPrefix: string,
  interactive = true,
) {
  return items.map((item, idx) => {
    const content = (
      <>
      <span className="homepage-ticker-source">
        [{(item.source || "NEWS").toUpperCase()}]
      </span>
      <span className="homepage-ticker-title">{item.title}</span>
      </>
    );

    return interactive ? (
      <a
        key={`${keyPrefix}-${item.id || idx}`}
        href={item.url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="homepage-ticker-item"
        data-category={item.category?.toLowerCase() || "tech"}
      >
        {content}
      </a>
    ) : (
      <span
        key={`${keyPrefix}-${item.id || idx}`}
        className="homepage-ticker-item"
        data-category={item.category?.toLowerCase() || "tech"}
      >
        {content}
      </span>
    );
  });
}

export default function NewsTicker({
  initialItems,
  variant = "primary",
  isPaused = false,
}: NewsTickerProps) {
  const [items, setItems] = useState<NewsHeadlineItem[]>(initialItems || []);

  // Client-only shuffle seed. Starts as null so SSR renders alphabetical
  // order (no hydration mismatch). After hydration, the effect generates a
  // stable permutation that persists for the session; 5-min refreshes reuse
  // the same ordering so sources don't jump mid-session.
  const [shuffleSeed, setShuffleSeed] = useState<number[] | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    if (shuffleSeed !== null && shuffleSeed.length === items.length) return;
    const indices = Array.from({ length: items.length }, (_, i) => i);
    setShuffleSeed(fisherYatesShuffle(indices));
  }, [items, shuffleSeed]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fetchHeadlines() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/v1/ticker/headlines", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const raw: TickerHeadline[] = variant === "secondary"
          ? data.bottomTickerItems
          : data.topTickerItems;
        if (!cancelled && Array.isArray(raw) && raw.length > 0) {
          setItems(raw.map(toNewsItem));
        }
      } catch {
        // keep previous items on error
      }
    }

    function startInterval() {
      if (intervalId !== null) return;
      intervalId = setInterval(fetchHeadlines, REFRESH_INTERVAL_MS);
    }

    function stopInterval() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopInterval();
      } else {
        startInterval();
      }
    }

    fetchHeadlines();
    startInterval();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      stopInterval();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [variant]);

  const orderedItems = useMemo(() => {
    if (!shuffleSeed) return items;
    if (items.length !== shuffleSeed.length) return items;
    return shuffleSeed.map(idx => items[idx]).filter(Boolean);
  }, [items, shuffleSeed]);

  const rowClass = variant === "secondary"
    ? "homepage-ticker-row homepage-ticker-row--news-secondary"
    : "homepage-ticker-row homepage-ticker-row--news";

  const ariaLabel = variant === "secondary"
    ? "More live news headlines"
    : "Live news headlines";

  if (!orderedItems || orderedItems.length === 0) {
    return (
      <div
        className={rowClass}
        role="marquee"
        aria-label={ariaLabel}
        data-paused={isPaused ? "true" : "false"}
      >
        <div className="homepage-ticker-content" key="content-primary">
          <span className="homepage-ticker-item">Loading headlines...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={rowClass}
      role="marquee"
      aria-label={ariaLabel}
      data-paused={isPaused ? "true" : "false"}
    >
      <div className="homepage-ticker-content" key="content-primary">
        {renderItems(orderedItems, "primary")}
      </div>
      <div className="homepage-ticker-content" aria-hidden="true" key="content-mirror">
        {renderItems(orderedItems, "mirror", false)}
      </div>
    </div>
  );
}
