'use client';

import React from 'react';

interface StatsBarProps {
  views: number;
  transmissions: number;
  top8Count: number;
  daysActive: number;
}

export default function StatsBar({ views, transmissions, top8Count, daysActive }: StatsBarProps) {
  const stats = [
    { label: 'VIEWS', value: views.toLocaleString() },
    { label: 'TRANSMISSIONS', value: transmissions.toString() },
    { label: 'TOP 8', value: `${top8Count}/8` },
    { label: 'DAYS ACTIVE', value: daysActive.toString() },
  ];

  return (
    <div
      className="border p-3 mb-4"
      style={{
        borderColor: 'var(--profile-border)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#767676]">
        {stats.map((stat, i) => (
          <React.Fragment key={stat.label}>
            {i > 0 && <span className="hidden sm:inline">|</span>}
            <span>
              {stat.label}: <span className="text-[#999]">{stat.value}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
