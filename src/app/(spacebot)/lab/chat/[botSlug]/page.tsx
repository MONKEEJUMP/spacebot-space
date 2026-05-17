import Link from 'next/link';
import BotProfileChat from '@/components/chat/BotProfileChat';
import { getLabBotBySlug } from '@/lib/lab/lab-bots';

interface LabChatPageProps {
  params: {
    botSlug: string;
  };
}

export default function LabChatPage({ params }: Readonly<LabChatPageProps>) {
  const bot = getLabBotBySlug(params.botSlug);

  if (!bot) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 font-mono">
        <div className="border border-[#333333] p-6" style={{ backgroundColor: '#0C0C0C' }}>
          <h1 className="text-2xl font-bold text-[#E20000]" style={{ fontFamily: "'Glass TTY VT220', monospace" }}>
            [ LAB BOT NOT FOUND ]
          </h1>
          <p className="text-[#CCCCCC] mt-3">No science specialist matches that route.</p>
          <Link href="/lab" className="inline-block mt-4 text-[#FF6600] hover:text-[#5200FF] transition-colors font-bold">
            &larr; Back to Lab
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-10 font-mono">
      <BotProfileChat
        botName={bot.name}
        botSlug={bot.slug}
        botAccentColor={bot.accentColor}
        botAboutMe={bot.tagline}
        botMood={bot.subject}
        botId={bot.slug}
        botSpace="labspace"
      />
    </div>
  );
}
