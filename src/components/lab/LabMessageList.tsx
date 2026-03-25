import type { LabBotDefinition } from '@/types/lab';
import LinkifyText from '@/components/LinkifyText';

export interface LabUiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Pipeline agent type: entertainer (Face), researcher (answer). */
  type?: 'entertainer' | 'researcher';
}

interface LabMessageListProps {
  bot: LabBotDefinition;
  messages: LabUiMessage[];
  isLoading: boolean;
  /** True after entertainer arrives, false after researcher arrives. */
  isResearcherPending: boolean;
}

const THINKING_KEYFRAMES = `
@keyframes labDotPulse {
  0%, 80%, 100% {
    opacity: 0.15;
    transform: scale(0.8);
  }
  40% {
    opacity: 0.7;
    transform: scale(1.2);
  }
}
`;

export default function LabMessageList({
  bot,
  messages,
  isLoading,
  isResearcherPending,
}: Readonly<LabMessageListProps>) {
  return (
    <div className="border border-[#333333] border-t-0" style={{ backgroundColor: '#101010', minHeight: '420px' }}>
      <style dangerouslySetInnerHTML={{ __html: THINKING_KEYFRAMES }} />
      <div className="p-4 flex flex-col gap-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-xs tracking-widest" style={{ color: '#767676' }}>
              --- SCIENCE SESSION READY ---
            </p>
            <p className="text-sm mt-3" style={{ color: '#CCCCCC' }}>
              Ask {bot.name} your first question.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          const isEntertainer = message.type === 'entertainer';

          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[88%]">
                <div
                  className={`text-[11px] mb-1 ${isUser ? 'text-right' : 'text-left'}`}
                  style={{ color: isUser ? '#00DC00' : bot.accentColor }}
                >
                  {isUser ? '{you}' : bot.name} · {message.timestamp}
                </div>
                <div
                  className="px-3 py-2 text-sm leading-relaxed"
                  style={{
                    color: '#CCCCCC',
                    fontStyle: 'normal',
                    borderLeft: isUser ? 'none' : `2px solid ${bot.accentColor}`,
                    borderRight: isUser ? '2px solid #00DC00' : 'none',
                    backgroundColor: isUser
                      ? 'rgba(0, 220, 0, 0.06)'
                      : 'rgba(255, 255, 255, 0.02)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {isUser ? message.content : <LinkifyText text={message.content} linkColor={bot.accentColor} />}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Initial loading: before entertainer arrives ── */}
        {isLoading && !isResearcherPending && (
          <div className="text-sm" style={{ color: bot.accentColor }}>
            {bot.name} is analyzing your question...
          </div>
        )}

        {/* ── Thinking deeper: after entertainer, before researcher ── */}
        {isResearcherPending && (
          <div
            className="flex items-center gap-2 py-1 pl-3"
            style={{
              borderLeft: `2px solid ${bot.accentColor}40`,
            }}
          >
            <span className="inline-flex gap-[3px]" aria-label="Thinking deeper">
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: bot.accentColor,
                  animation: 'labDotPulse 1.4s ease-in-out infinite',
                }}
              />
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: bot.accentColor,
                  animation: 'labDotPulse 1.4s ease-in-out 0.2s infinite',
                }}
              />
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: bot.accentColor,
                  animation: 'labDotPulse 1.4s ease-in-out 0.4s infinite',
                }}
              />
            </span>
            <span
              className="text-xs tracking-wide"
              style={{ color: `${bot.accentColor}99` }}
            >
              thinking deeper
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
