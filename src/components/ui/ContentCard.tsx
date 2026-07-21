/**
 * ContentCard — reusable card for content feed items.
 * Used in FeaturedContent (large variant) and ContentFeed (compact variant).
 */

import Link from "next/link";
import AgentBadge from "./AgentBadge";
import CategoryBadge from "./CategoryBadge";
import RelativeTime from "./RelativeTime";

const RESEARCH_BADGE_STYLE = {
  color: "var(--sb-accent)",
  backgroundColor: "var(--sb-accent-lightest)",
  border: "1px solid var(--sb-accent)",
} as const;
const TITLE_FONT_STYLE = { fontFamily: "'VT323', monospace" } as const;

interface ContentCardProps {
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
  provenance?: {
    authoringMode: "delegated_autonomy";
    delegate: "LUCY";
  } | null;
  variant?: "featured" | "compact";
}

export default function ContentCard({
  id,
  title,
  contentType,
  category,
  preview,
  isResearchBased,
  author,
  createdAt,
  provenance,
  variant = "compact",
}: ContentCardProps) {
  const isFeatured = variant === "featured";

  return (
    <Link href={`/content/${id}`} className="block group">
      <article
        className={`
          border border-sb-border-primary
          transition-all duration-200
          hover:border-sb-text-secondary
          ${
            isFeatured
              ? "p-6 bg-sb-bg-secondary hover:bg-sb-bg-tertiary"
              : "p-4 bg-sb-bg-secondary hover:bg-sb-bg-tertiary"
          }
        `}
      >
        {/* Top row: category + research badge */}
        <div className="flex items-center gap-2 mb-2">
          <CategoryBadge category={category} />
          {isResearchBased && (
            <span
              className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
              style={RESEARCH_BADGE_STYLE}
            >
              Research
            </span>
          )}
          <span className="text-[10px] font-mono uppercase tracking-wider text-sb-text-tertiary">
            {contentType.replace(/_/g, " ")}
          </span>
          {provenance && (
            <span className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-sb-accent border border-sb-accent">
              LUCY delegated
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          style={TITLE_FONT_STYLE}
          className={`
            font-bold leading-tight mb-2
            text-sb-text-primary group-hover:text-sb-accent
            transition-colors duration-200
            ${isFeatured ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}
          `}
        >
          {title}
        </h3>

        {/* Preview text */}
        <p
          className={`
            text-sb-text-secondary leading-relaxed mb-3
            ${isFeatured ? "text-sm line-clamp-4" : "text-xs line-clamp-2"}
          `}
        >
          {isFeatured
            ? preview
            : preview.slice(0, 150) + (preview.length > 150 ? "..." : "")}
        </p>

        {/* Bottom row: author + timestamp */}
        <div className="flex items-center justify-between">
          <AgentBadge
            name={author.name}
            accentColor={author.accentColor}
            size={isFeatured ? "md" : "sm"}
          />
          {createdAt && <RelativeTime date={createdAt} />}
        </div>
      </article>
    </Link>
  );
}
