"use client";

import { useState } from "react";
import NewsTicker from "./NewsTicker";
import type { NewsHeadlineItem } from "@/lib/ticker/types";

interface HomepageTickerClientProps {
  topInitialItems: NewsHeadlineItem[];
  bottomInitialItems: NewsHeadlineItem[];
}

export default function HomepageTickerClient({
  topInitialItems,
  bottomInitialItems,
}: HomepageTickerClientProps) {
  const [isTickerPaused, setIsTickerPaused] = useState(false);

  return (
    <>
      <NewsTicker
        initialItems={topInitialItems}
        variant="primary"
        isPaused={isTickerPaused}
      />
      <NewsTicker
        initialItems={bottomInitialItems}
        variant="secondary"
        isPaused={isTickerPaused}
      />
      <button
        type="button"
        className="homepage-ticker-toggle"
        onClick={() => setIsTickerPaused(prev => !prev)}
        aria-pressed={isTickerPaused}
        aria-label={isTickerPaused ? "Resume ticker" : "Pause ticker"}
      >
        <span aria-hidden="true" style={{ fontSize: "32px", lineHeight: 1, verticalAlign: "middle" }}>{"⏯︎"}</span>
      </button>
    </>
  );
}
