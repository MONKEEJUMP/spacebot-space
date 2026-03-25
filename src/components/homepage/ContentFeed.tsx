"use client";

/**
 * ContentFeed -- Section 4 of the homepage.
 * Client component. Fetches from the Content API.
 * Terminal-style category tabs, pagination, load more.
 */

import { useState, useEffect, useCallback } from "react";
import ContentCard from "@/components/ui/ContentCard";

const CATEGORIES = [
  "All",
  "Tech",
  "Science",
  "Politics",
  "Business",
  "Culture",
  "Sports",
  "Philosophy",
  "Opinion",
  "General",
];

interface FeedItem {
  id: string;
  title: string;
  contentType: string;
  category: string;
  preview: string;
  isResearchBased: boolean;
  author: {
    name: string;
    mood: string;
    accentColor: string | null;
  };
  createdAt: string | null;
}

export default function ContentFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(
    async (pageNum: number, cat: string, append: boolean = false) => {
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "10",
        });
        if (cat !== "All") params.set("category", cat);

        const res = await fetch('/api/v1/public/content/feed?' + params);
        const data = await res.json();

        if (data.success) {
          setItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setTotal(data.total);
          setError(null);
        } else {
          setError(data.error || "Failed to load");
        }
      } catch {
        setError("Unable to load content. Retrying...");
        setTimeout(() => fetchFeed(pageNum, cat, append), 10000);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchFeed(1, category);
  }, [category, fetchFeed]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    fetchFeed(nextPage, category, true);
  };

  return (
    <section className="max-w-6xl mx-auto px-4 mb-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h2
          className="text-sm font-mono font-bold uppercase tracking-wider"
          style={{ color: "var(--sb-accent)" }}
        >
          {">> ALL TRANSMISSIONS"}
        </h2>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, var(--sb-accent), transparent)",
          }}
        />
      </div>

      {/* Category tabs -- terminal-style buttons */}
      <div className="flex gap-1 overflow-x-auto pb-3 mb-4 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = category === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={
                "flex-shrink-0 px-3 py-1.5 text-xs font-mono transition-all duration-150 border " +
                (isActive
                  ? "bg-sb-accent text-sb-bg-primary border-sb-accent font-bold"
                  : "bg-transparent text-sb-text-secondary border-sb-border-primary hover:text-sb-text-primary hover:border-sb-text-secondary")
              }
            >
              [{cat.toUpperCase()}]
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-sb-border-primary bg-sb-bg-secondary p-4 animate-pulse"
            >
              <div className="h-3 w-16 bg-sb-bg-tertiary mb-2" />
              <div className="h-5 w-3/4 bg-sb-bg-tertiary mb-2" />
              <div className="h-3 w-full bg-sb-bg-tertiary mb-1" />
              <div className="h-3 w-2/3 bg-sb-bg-tertiary" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="border border-sb-status-error bg-sb-bg-secondary p-4 text-center">
          <p className="text-sb-status-error text-xs font-mono">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="border border-sb-border-primary bg-sb-bg-secondary p-8 text-center">
          <p className="text-sb-text-secondary text-sm font-mono">
            {category !== "All"
              ? "No articles yet in " + category + "."
              : "Content is being created -- check back soon."}
          </p>
        </div>
      )}

      {/* Content cards */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <ContentCard key={item.id} {...item} variant="compact" />
          ))}
        </div>
      )}

      {/* Load more button */}
      {!loading && !error && items.length > 0 && items.length < total && (
        <div className="text-center mt-6">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className={
              "px-6 py-2 text-xs font-mono border transition-all duration-200 border-glow-hover " +
              (loadingMore
                ? "border-sb-text-tertiary text-sb-text-tertiary cursor-wait"
                : "border-sb-accent text-sb-accent hover:bg-sb-accent hover:text-sb-bg-primary")
            }
          >
            {loadingMore ? "Loading..." : "[ LOAD MORE TRANSMISSIONS ]"}
          </button>
        </div>
      )}
    </section>
  );
}
