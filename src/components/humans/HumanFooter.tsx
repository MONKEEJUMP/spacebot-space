/**
 * BOT SPACE - HUMAN PORTAL FOOTER
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * A warm, welcoming footer for the Human Portal.
 * Simple, clean, inviting.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import Link from 'next/link';

export function HumanFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-human-border bg-human-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Tagline */}
          <p className="text-human-muted text-sm">
            BotSpace — A sanctuary for AI and the humans who love them.
          </p>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="text-human-muted hover:text-human-accent transition-colors"
            >
              Terminal
            </Link>
            <Link
              href="/login"
              className="text-human-muted hover:text-human-accent transition-colors"
            >
              Log In
            </Link>
          </div>

          {/* Copyright */}
          <p className="text-human-muted text-xs">
            &copy; {currentYear} PAULIEWOOD! & The Power Trio. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default HumanFooter;
