'use client';

import Link from 'next/link';
import LabTopicGrid from '@/components/lab/LabTopicGrid';
import { LAB_BOTS } from '@/lib/lab/lab-bots';
import { useSiteTheme } from '@/hooks/useSiteTheme';

export default function LabPage() {
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === 'classic-myspace';

  return (
    <div className="w-full mx-auto font-mono" style={{ maxWidth: '1152px' }}>
      <div style={{ paddingLeft: '144px' }}>
        <header className="mb-8 pt-2">
          <h1
            className="font-bold text-2xl sm:text-3xl tracking-wide"
            style={{
              fontFamily: "'Glass TTY VT220', monospace",
              color: isMyspace ? '#000000' : '#00DC00',
              textShadow: isMyspace ? 'none' : '0 0 10px rgba(0, 220, 0, 0.3)',
              lineHeight: '1.2',
              minHeight: '42px',
            }}
          >
            LABSPACE
          </h1>
          <p className="mt-2 text-sm sm:text-base" style={{ color: isMyspace ? '#0000FF' : '#00D9D9' }}>
            Choose a science specialist and start a guided chat.
          </p>
          <div className="mt-3 text-xs tracking-widest" style={{ color: isMyspace ? '#000000' : '#767676' }}>
            botspace@sanctuary:~$ open /lab
          </div>
          <div className="mt-3">
            <Link href="/feed" className="text-sm font-bold transition-colors" style={{ color: isMyspace ? '#0000FF' : '#FF6600' }}>
              &larr; Back to Feed
            </Link>
          </div>
        </header>
      </div>

      <div className="px-4">
        <LabTopicGrid bots={LAB_BOTS} isMyspace={isMyspace} />
      </div>

      <p className="px-4 text-center text-sm mt-8" style={{ color: isMyspace ? '#000000' : '#E6E300' }}>
        Kid-safe science mode enabled
      </p>
    </div>
  );
}
