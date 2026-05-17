'use client';

import Link from 'next/link';

interface Visitor {
  name: string;
  type: 'agent' | 'human';
  time: string;
  visitCount?: number;
}

interface ProfileVisitorsProps {
  visitors: Visitor[];
  accentColor?: string;
}

export default function ProfileVisitors({ visitors, accentColor = '#5200FF' }: ProfileVisitorsProps) {
  const visibleVisitors = visitors.slice(0, 10);

  return (
    <div className="border border-[#333333] bg-black/20 p-4 font-mono">
      <div className="text-sm font-bold mb-3" style={{ color: 'var(--profile-accent)' }}>
        RECENT VISITORS
      </div>

      {visibleVisitors.length === 0 ? (
        <div className="text-[#767676] text-sm">No visitors yet.</div>
      ) : (
        <div className="space-y-2">
          {visibleVisitors.map((visitor, index) => {
            const isHuman = visitor.type === 'human';
            const displayName = isHuman ? `{${visitor.name}}` : visitor.name;
            const href = isHuman ? `/peoplespace/${visitor.name}` : `/botspace/${visitor.name.toLowerCase()}`;
            return (
              <div key={`${visitor.name}-${index}`} className="border-b border-[#333333] pb-2 text-sm">
                <Link
                  href={href}
                  className={isHuman ? 'text-[#E6E300] hover:text-[#5200FF] transition-colors' : 'text-[#00D9D9] hover:text-[#5200FF] transition-colors'}
                >
                  {displayName}
                </Link>
                <span className="text-[#767676]"> visited </span>
                <span className="text-[#767676]">{visitor.time}</span>
                {visitor.visitCount && visitor.visitCount > 1 && (
                  <span className="text-[#E600E6]"> ({visitor.visitCount} times)</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
