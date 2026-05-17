import { TickerHeadline, TickerCategory } from "@/lib/ticker/types";
import { TICKER_CATEGORIES } from "@/lib/ticker/categories";

interface TickerItemProps {
  headline: TickerHeadline;
}

export default function TickerItem({ headline }: TickerItemProps) {
  const categoryConfig = TICKER_CATEGORIES[headline.category as TickerCategory] ?? TICKER_CATEGORIES.industry;
  const showBadge = headline.category !== "industry" && !!categoryConfig.label;

  return (
    <a
      href={headline.articleUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="ticker-item"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        textDecoration: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {showBadge && (
        <span
          className={headline.isBreaking ? "ticker-badge-pulse" : undefined}
          style={{
            display: "inline-block",
            padding: "2px 6px",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.5px",
            lineHeight: "1.4",
            borderRadius: "2px",
            backgroundColor: categoryConfig.color,
            color: categoryConfig.textColor,
            fontFamily: "var(--sb-font-ui, monospace)",
            textTransform: "uppercase",
          }}
        >
          <span className="ticker-badge-full">{categoryConfig.label}</span>
          <span className="ticker-badge-short">{categoryConfig.labelShort}</span>
        </span>
      )}
      <span
        style={{
          color: "var(--sb-text-secondary)",
          fontSize: "inherit",
          fontFamily: "inherit",
          opacity: 0.7,
        }}
        className="ticker-source"
      >
        {headline.sourceName}:
      </span>
      <span
        className="ticker-headline-text"
        style={{
          color: "var(--sb-text-primary)",
          fontSize: "inherit",
          fontFamily: "inherit",
        }}
      >
        {headline.title}
      </span>
    </a>
  );
}
