'use client';

import dynamic from 'next/dynamic';

const AvatarGenerator = dynamic(() => import('./AvatarGenerator'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-full bg-muted" />,
});

export default function AvatarInlineDisplay({ url, className }: { url: string; className?: string }) {
  const params = new URLSearchParams(url.split('?')[1] || '');
  const seed = params.get('seed') || '';
  const isBot = params.get('isBot') === 'true';
  const size = parseInt(params.get('size') || '200', 10);

  return (
    <div className={className || 'h-full w-full overflow-hidden rounded-full'}>
      <AvatarGenerator seed={seed} size={size} isBot={isBot} />
    </div>
  );
}
