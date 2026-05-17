'use client';

import Link from 'next/link';

export default function SiteLogo() {
  return (
    <Link
      href="/"
      className="fixed top-[4.5rem] left-4 z-[45] hidden sm:inline-flex items-center gap-1.5 text-[#5200FF] opacity-60 hover:opacity-100 transition-opacity duration-200 group"
      aria-label="Return to homepage terminal"
    >
      <span className="text-[#767676] group-hover:text-[#5200FF] transition-colors text-sm font-mono">
        {'>'}_
      </span>
      <span
        className="text-lg tracking-wide"
        style={{
          fontFamily: "'Glass TTY VT220', monospace",
          textShadow: '0 0 5px rgba(0, 255, 65, 0.3), 0 0 10px rgba(0, 255, 65, 0.15)',
        }}
      >
        SPACEBOT.SPACE
      </span>
    </Link>
  );
}
