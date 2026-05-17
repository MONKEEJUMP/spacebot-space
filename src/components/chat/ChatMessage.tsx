'use client';

import LinkifyText from '@/components/LinkifyText';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  metrics?: {
    totalCycleMs: number;
    totalTokens: number;
    wingmenCompleted: number;
  };
  isLoading?: boolean;
  isError?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  botDisplayName: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatCycleTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ChatMessage({ message, botDisplayName }: Readonly<ChatMessageProps>) {
  const isUser = message.role === 'user';

  if (message.isLoading) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <div
            className="text-[10px] uppercase tracking-widest mb-1"
            style={{
              color: 'var(--sb-accent, #5200FF)',
              fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            }}
          >
            {botDisplayName} &middot; {formatTime(message.timestamp)}
          </div>
          <div
            className="flex items-center gap-2 px-3 py-3"
            style={{
              borderLeft: '2px solid var(--sb-accent, #5200FF)',
              backgroundColor: 'var(--sb-bg-secondary, #111118)',
            }}
          >
            <span className="inline-flex gap-[3px]" aria-label="Processing">
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: 'var(--sb-accent, #5200FF)',
                  animation: 'botChatDotPulse 1.4s ease-in-out infinite',
                }}
              />
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: 'var(--sb-accent, #5200FF)',
                  animation: 'botChatDotPulse 1.4s ease-in-out 0.2s infinite',
                }}
              />
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: 'var(--sb-accent, #5200FF)',
                  animation: 'botChatDotPulse 1.4s ease-in-out 0.4s infinite',
                }}
              />
            </span>
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{
                color: 'var(--sb-text-secondary, #767676)',
                fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              }}
            >
              PROCESSING TRANSMISSION
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        <div
          className={`text-[10px] uppercase tracking-widest mb-1 ${isUser ? 'text-right' : 'text-left'}`}
          style={{
            color: isUser ? 'var(--sb-text-secondary, #767676)' : 'var(--sb-accent, #5200FF)',
            fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
          }}
        >
          {isUser ? 'YOU' : botDisplayName} &middot; {formatTime(message.timestamp)}
        </div>

        <div
          className="px-3 py-2 text-sm leading-relaxed"
          style={{
            color: message.isError ? '#E20000' : 'var(--sb-text-primary, #CCCCCC)',
            fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            borderLeft: isUser ? 'none' : `2px solid ${message.isError ? '#E20000' : 'var(--sb-accent, #5200FF)'}`,
            borderRight: isUser ? '2px solid var(--sb-text-secondary, #767676)' : 'none',
            backgroundColor: isUser ? 'rgba(255, 255, 255, 0.03)' : 'var(--sb-bg-secondary, #111118)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {isUser ? message.content : <LinkifyText text={message.content} />}
        </div>

        {message.metrics && !message.isError && (
          <div
            className="mt-1 text-[10px] tracking-widest"
            style={{
              color: 'var(--sb-text-tertiary, #555555)',
              fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            }}
          >
            &#9889; {formatCycleTime(message.metrics.totalCycleMs)} &middot;{' '}
            {message.metrics.totalTokens.toLocaleString()} tokens &middot;{' '}
            {message.metrics.wingmenCompleted}/5 wingmen
          </div>
        )}
      </div>
    </div>
  );
}
