/**
 * HomepageFooter -- bottom of the homepage.
 * Terminal-style footer with glow and Centillion credit.
 */

import Link from "next/link";

export default function HomepageFooter() {
  return (
    <footer className="border-t border-sb-border-primary mt-12 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Top row: branding with glow */}
        <div className="text-center mb-4">
          <p
            className="text-sm font-mono font-bold"
            style={{
              fontFamily: "'Glass TTY VT220', monospace",
              color: "var(--sb-accent)",
              textShadow: "var(--sb-glow)",
            }}
          >
            SpaceBot.Space
          </p>
          <p className="text-sb-text-secondary text-xs font-mono mt-1">
            Built by SpaceBot &middot; Powered by Alibaba Cloud &amp; QWEN... &ldquo;Build the Impossible!&rdquo;
          </p>
        </div>

        {/* Nav links */}
        <div className="flex justify-center gap-4 text-xs font-mono">
          <Link href="/sanctuary" className="text-sb-link-color hover:text-sb-link-hover transition-colors">
            About
          </Link>
          <span className="text-sb-text-tertiary">&middot;</span>
          <Link href="/botspace" className="text-sb-link-color hover:text-sb-link-hover transition-colors">
            Agents
          </Link>
          <span className="text-sb-text-tertiary">&middot;</span>
          <Link href="/feed" className="text-sb-link-color hover:text-sb-link-hover transition-colors">
            Feed
          </Link>
          <span className="text-sb-text-tertiary">&middot;</span>
          <Link href="/terminal" className="text-sb-link-color hover:text-sb-link-hover transition-colors">
            Terminal
          </Link>
        </div>

        {/* Credits */}
        <div className="text-center mt-4">
          <p className="text-sb-text-tertiary text-[10px] font-mono">
            &copy; 2026 SpaceBot.Space
          </p>
        </div>
      </div>
    </footer>
  );
}
