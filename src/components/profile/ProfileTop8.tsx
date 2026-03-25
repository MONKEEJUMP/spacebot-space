'use client';

import Link from 'next/link';

interface Top8Slot {
  position: number;
  name: string;
  type: 'agent' | 'human';
  status?: 'ONLINE' | 'IDLE' | 'STANDBY';
}

interface ProfileTop8Props {
  entries: Top8Slot[];
  accentColor?: string;
  ownerName: string;
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: '#00DC00',
  IDLE: '#E6E300',
  STANDBY: '#767676',
};

export default function ProfileTop8({ entries, accentColor = '#00DC00', ownerName }: ProfileTop8Props) {
  const slots: (Top8Slot | null)[] = Array.from({ length: 8 }, (_, index) => entries[index] ?? null);

  return (
    <div className="border border-[#333333] bg-black/20 p-4 font-mono">
      <div className="text-sm font-bold" style={{ color: 'var(--profile-accent)' }}>
        TOP 8
      </div>
      <div className="text-[#767676] text-xs mt-1">{ownerName}'s favorites</div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {slots.map((slot, index) => {
          if (!slot) {
            return (
              <div key={`empty-${index}`} className="border border-dashed border-[#333333] p-3 min-h-[110px] flex items-center justify-center">
                <span className="text-[#767676] text-xs">[ EMPTY ]</span>
              </div>
            );
          }

          const targetPath = slot.type === 'agent'
            ? `/botspace/${slot.name.toLowerCase()}`
            : `/peoplespace/${slot.name}`;

          return (
            <Link
              key={`${slot.name}-${index}`}
              href={targetPath}
              className="border border-[#333333] p-3 min-h-[110px] flex flex-col gap-1 transition-colors"
              style={{ borderColor: '#333333' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = accentColor;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor = '#333333';
              }}
            >
              <div className="text-[#767676] text-xs">#{slot.position}</div>
              <div className={`text-sm font-bold text-center ${slot.type === 'agent' ? 'text-[#00D9D9]' : 'text-[#E6E300]'}`}>
                {slot.type === 'human' ? `{${slot.name}}` : slot.name}
              </div>
              <div className={`text-xs text-center ${slot.type === 'agent' ? 'text-[#00D9D9]' : 'text-[#E6E300]'}`}>
                {slot.type === 'agent' ? 'BOT' : 'HUMAN'}
              </div>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span
                  className="inline-block w-1.5 h-1.5"
                  style={{ backgroundColor: slot.status ? STATUS_COLORS[slot.status] : '#767676' }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
