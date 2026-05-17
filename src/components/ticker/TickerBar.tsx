"use client";

import { useState } from "react";
import useSWR from "swr";
import Marquee from "react-fast-marquee";
import { TickerHeadline } from "@/lib/ticker/types";
import { DEMO_HEADLINES } from "@/lib/ticker/demo-data";
import TickerItem from "./TickerItem";
import TickerPauseButton from "./TickerPauseButton";

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      if (Array.isArray(data)) return data;
      return [...(data.topTickerItems ?? []), ...(data.bottomTickerItems ?? [])];
    });

interface TickerBarProps {
  initialHeadlines?: TickerHeadline[];
}

export default function TickerBar({ initialHeadlines }: TickerBarProps) {
  const [isPlaying, setIsPlaying] = useState(true);

  const { data: liveHeadlines } = useSWR<TickerHeadline[]>(
    "/api/v1/ticker/headlines",
    fetcher,
    {
      fallbackData: initialHeadlines && initialHeadlines.length > 0
        ? initialHeadlines
        : DEMO_HEADLINES,
      refreshInterval: 300_000,
      revalidateOnFocus: true,
    }
  );

  const headlines = liveHeadlines && liveHeadlines.length > 0
    ? liveHeadlines
    : DEMO_HEADLINES;

  if (!headlines || headlines.length === 0) {
    return (
      <div className="ticker-bar" style={tickerContainerStyle}>
        <span
          style={{
            color: "var(--sb-text-secondary, #767676)",
            fontFamily: "var(--sb-font-ui, monospace)",
            fontSize: "clamp(11px, 1.3vw, 13px)",
            textTransform: "uppercase",
            letterSpacing: "2px",
            padding: "0 16px",
            animation: "tickerPulse 2s ease-in-out infinite",
          }}
        >
          Initializing A<span style={{ textTransform: "none", fontSize: "0.85em", verticalAlign: "baseline" }}>i</span>SPACE news feed...
        </span>
      </div>
    );
  }

  return (
    <div className="ticker-bar" style={tickerContainerStyle}>
      <div className="ticker-fade-left" />
      <Marquee
        pauseOnHover
        speed={50}
        gradient={false}
        autoFill
        play={isPlaying}
        style={{ overflow: "hidden" }}
      >
        {headlines.map((headline) => (
          <div
            key={headline.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0",
              flexShrink: 0,
            }}
          >
            <TickerItem headline={headline} />
            <span
              style={{
                color: "var(--sb-accent, #5200FF)",
                margin: "0 20px",
                fontSize: "8px",
                opacity: 0.6,
                flexShrink: 0,
              }}
            >
              &#9670;
            </span>
          </div>
        ))}
      </Marquee>
      <div className="ticker-fade-right" />
      <TickerPauseButton
        isPlaying={isPlaying}
        onToggle={() => setIsPlaying((prev) => !prev)}
      />

      <style>{`
        .ticker-bar {
          position: relative;
        }
        .ticker-fade-left,
        .ticker-fade-right {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 30px;
          z-index: 5;
          pointer-events: none;
        }
        .ticker-fade-left {
          left: 0;
          background: linear-gradient(to right, var(--sb-bg-secondary, #141414), transparent);
        }
        .ticker-fade-right {
          right: 40px;
          background: linear-gradient(to left, var(--sb-bg-secondary, #141414), transparent);
        }

        .ticker-item:hover .ticker-headline-text {
          text-decoration: underline;
          text-decoration-color: var(--sb-accent, #5200FF);
          text-underline-offset: 2px;
        }

        .ticker-badge-short {
          display: none;
        }

        @keyframes tickerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .ticker-badge-pulse {
          animation: tickerPulse 1.5s ease-in-out infinite;
        }

        @media (max-width: 767px) {
          .ticker-source {
            display: none !important;
          }
          .ticker-badge-full {
            display: none !important;
          }
          .ticker-badge-short {
            display: inline !important;
          }
        }

        @media (max-width: 480px) {
          .ticker-badge-pulse,
          .ticker-item span:first-child {
            /* Keep badges visible even on small mobile */
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ticker-badge-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

const tickerContainerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "44px",
  display: "flex",
  alignItems: "center",
  backgroundColor: "var(--sb-bg-secondary, #141414)",
  borderBottom: "1px solid var(--sb-border-primary, #333)",
  fontFamily: "var(--sb-font-ui, 'IBM Plex Mono', monospace)",
  fontSize: "clamp(11px, 1.3vw, 13px)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  overflow: "hidden",
  userSelect: "none",
};
