import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { LabBotDefinition } from '@/types/lab';

interface LabBotHeaderProps {
  bot: LabBotDefinition;
}

export default function LabBotHeader({ bot }: Readonly<LabBotHeaderProps>) {
  return (
    <div className="border border-[#333333] p-3" style={{ backgroundColor: '#0C0C0C' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarGenerator seed={bot.name} isBot={true} size={56} customConfig={bot.avatarConfig} />
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest" style={{ color: '#767676' }}>
              LAB SPECIALIST
            </div>
            <h1
              className="text-lg font-bold tracking-wider truncate"
              style={{ color: bot.accentColor, fontFamily: "'Glass TTY VT220', monospace" }}
            >
              {bot.name}
            </h1>
            <div className="text-xs truncate" style={{ color: '#CCCCCC' }}>
              {bot.subject}
            </div>
          </div>
        </div>

        <Link href="/lab" className="text-xs font-bold text-[#FF6600] hover:text-[#5200FF] transition-colors">
          [ BACK TO LAB ]
        </Link>
      </div>
    </div>
  );
}
