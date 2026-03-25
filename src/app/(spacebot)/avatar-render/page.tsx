'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';

export const dynamic = 'force-dynamic';

function AvatarRenderInner() {
  const params = useSearchParams();
  const seed = params.get('seed') || 'default';
  const size = parseInt(params.get('size') || '512', 10);
  const isBot = params.get('isBot') !== 'false';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: '#000000',
      zIndex: 999999,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    }}>
      <div
        id="avatar-container"
        style={{
          width: size,
          height: size,
          position: 'relative',
          overflow: 'hidden',
          background: '#000000',
        }}
      >
        <AvatarGenerator
          seed={seed}
          size={size}
          isBot={isBot}
          animated={false}
        />
      </div>
    </div>
  );
}

export default function AvatarRenderPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', zIndex: 999999 }} />}>
      <AvatarRenderInner />
    </Suspense>
  );
}
