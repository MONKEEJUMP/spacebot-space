import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { LabBotDefinition } from '@/types/lab';

interface LabTopicCardProps {
  bot: LabBotDefinition;
  isMyspace?: boolean;
}

export default function LabTopicCard({ bot, isMyspace }: Readonly<LabTopicCardProps>) {
  return (
    <Link
      href={`/lab/chat/${bot.slug}`}
      className="block border p-4 transition-colors"
      style={{
        backgroundColor: 'var(--sb-bg-secondary)',
        borderColor: 'var(--sb-border-primary)',
        borderLeftColor: bot.accentColor,
        borderLeftWidth: '2px',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <AvatarGenerator seed={bot.name} isBot={true} size={64} customConfig={bot.avatarConfig} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold font-mono" aria-hidden="true" style={{ color: isMyspace ? '#0000FF' : bot.accentColor }}>&gt;_</span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isMyspace ? '#0000FF' : bot.accentColor }}>
              [ ENTER LAB ]
            </span>
          </div>

          <h3
            className="mt-1 text-sm font-bold tracking-wider"
            style={{ color: 'var(--sb-text-primary)', fontFamily: "'Glass TTY VT220', monospace" }}
          >
            {bot.subject}
          </h3>

          <p className="mt-1 text-xs font-bold tracking-widest" style={{ color: isMyspace ? '#0000FF' : bot.accentColor }}>
            {bot.name}
          </p>

          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--sb-text-secondary)' }}>
            {bot.tagline}
          </p>
        </div>
      </div>
    </Link>
  );
}
