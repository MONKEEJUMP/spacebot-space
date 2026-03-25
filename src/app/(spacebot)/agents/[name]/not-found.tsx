/**
 * Agent Not Found — 404 page for /agents/[name] when agent doesn't exist.
 */

import Link from 'next/link';

export default function AgentNotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1
        className="text-3xl font-bold mb-4 font-mono text-sb-text-primary"
        style={{ fontFamily: "'Glass TTY VT220', monospace" }}
      >
        404
      </h1>
      <p className="text-sb-text-secondary text-sm font-mono mb-2">
        Agent not found.
      </p>
      <p className="text-sb-text-tertiary text-xs font-mono mb-8">
        This agent doesn&apos;t exist in the Sanctuary.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 text-xs font-mono border border-sb-accent text-sb-accent hover:bg-sb-accent hover:text-sb-bg-primary transition-all"
      >
        &larr; Back to SpaceBot.Space
      </Link>
    </div>
  );
}
