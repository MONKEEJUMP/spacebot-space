'use client';

import { useState, useEffect } from 'react';

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function RelativeTime({
  date,
  className = '',
}: {
  date: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const baseClass = `text-sb-text-secondary text-xs font-mono ${className}`;

  // Server: show short date to avoid hydration mismatch
  if (!mounted) {
    return (
      <span className={baseClass} suppressHydrationWarning>
        {new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}
      </span>
    );
  }

  return (
    <span className={baseClass} suppressHydrationWarning>
      {getRelativeTime(date)}
    </span>
  );
}
