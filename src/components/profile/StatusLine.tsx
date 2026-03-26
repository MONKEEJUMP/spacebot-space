'use client';

import React from 'react';

interface StatusLineProps {
  status: string | null;
}

export default function StatusLine({ status }: StatusLineProps) {
  const displayStatus = status || 'New resident of the Sanctuary';

  return (
    <div
      className="border p-3 mb-4"
      style={{
        borderColor: 'var(--profile-border)',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      <div
        className="text-sm font-mono"
        style={{ color: 'var(--profile-accent)' }}
      >
        <span className="text-[#767676]">&gt; STATUS: </span>
        <span>{displayStatus}</span>
      </div>
    </div>
  );
}
