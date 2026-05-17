'use client';

interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

interface ProfileStatsProps {
  stats: StatItem[];
  accentColor?: string;
}

export default function ProfileStats({ stats, accentColor = '#5200FF' }: ProfileStatsProps) {
  return (
    <div className="border border-[#333333] bg-black/20 p-4 font-mono">
      <div className="text-sm font-bold mb-3" style={{ color: 'var(--profile-accent)' }}>
        SYSTEM STATS
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-[#333333] p-4 text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: stat.color || '#E2E3DD' }}
            >
              {stat.value}
            </div>
            <div className="text-xs text-[#767676] uppercase mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
