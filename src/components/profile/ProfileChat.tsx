'use client';

import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import LinkifyText from '@/components/LinkifyText';
import { useAuthGate } from '@/hooks/useAuthGate';

interface ChatMessage {
  id: string;
  from: string;
  fromType: 'user' | 'owner';
  text: string;
  timestamp: string;
  /** Pipeline agent type: entertainer (Face), researcher (answer). */
  type?: 'entertainer' | 'researcher';
}

interface ProfileChatProps {
  ownerName: string;
  ownerType: 'agent' | 'human';
  accentColor: string;
  status: string;
  factionColor?: string;
  avatarElement?: ReactNode;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  ONLINE: '#00CC00',
  IDLE: '#E6E300',
  STANDBY: '#767676',
};

const THINKING_KEYFRAMES = `
@keyframes factionDotPulse {
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

export default function ProfileChat({
  ownerName,
  ownerType,
  accentColor,
  status,
  factionColor,
  avatarElement,
}: Readonly<ProfileChatProps>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputDraft, setInputDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResearcherPending, setIsResearcherPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { requireAuth } = useAuthGate();

  // Conversation history: only researcher answers for context (not Face)
  const conversationHistory = useMemo(
    () =>
      messages
        .filter((m) => m.fromType === 'user' || (m.fromType === 'owner' && m.type !== 'entertainer'))
        .map((m) => ({
          role: m.fromType === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        })),
    [messages],
  );

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading, isResearcherPending]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const getTimestamp = (): string => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const displayName = ownerName;
  const isHuman = ownerType === 'human';

  const handleSend = useCallback(() => {
    const text = inputDraft.trim();
    if (!text || isLoading) return;
    requireAuth(async () => {

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      from: 'You',
      fromType: 'user',
      text,
      timestamp: getTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputDraft('');
    setIsLoading(true);
    setIsResearcherPending(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          botName: ownerName,
        }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const data = await response.json() as {
        success: boolean;
        response?: string;
      };

      const botMsg: ChatMessage = {
        id: `r-${Date.now()}`,
        from: displayName,
        fromType: 'owner',
        text: data.response || 'Signal disrupted. Try again.',
        timestamp: getTimestamp(),
        type: 'researcher',
      };

      flushSync(() => {
        setMessages((prev) => [...prev, botMsg]);
      });
    } catch {
      // If API fails, show error message
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        from: displayName,
        fromType: 'owner',
        text: 'Signal lost. Try again.',
        timestamp: getTimestamp(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setIsResearcherPending(false);
      if (inputRef.current) inputRef.current.focus();
    }
    });
  }, [inputDraft, isLoading, ownerName, displayName, requireAuth]);

  const statusDotColor = STATUS_DOT_COLORS[status] || '#767676';

  return (
    <div style={{ border: 'none', textTransform: 'uppercase' as const, fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace" }}>
      <style dangerouslySetInnerHTML={{ __html: THINKING_KEYFRAMES + `
        .chat-input-bright::placeholder {
          color: #000000 !important;
          opacity: 1;
        }
        .chat-input-human::placeholder {
          color: #000000 !important;
          opacity: 1;
        }
        @keyframes msgSlideInLeft {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes msgSlideInRight {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes channelPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}} />

      {/* ═══ HEADER — Secure Channel Bar ═══ */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{
          backgroundColor: accentColor,
          borderBottom: `2px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Bot identity dot — accent color square */}
          <span
            className="inline-block w-3 h-3"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 6px ${accentColor}88`,
            }}
          />
          <div>
            <div
              className="text-xs font-bold uppercase"
              style={{
                color: '#000000',
                letterSpacing: '0.15em',
                fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              }}
            >
              DIRECT LINK
            </div>
            <div
              className="text-[10px]"
              style={{
                color: '#000000',
                fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              }}
            >
              {displayName} &mdash; {isHuman ? 'Direct Message' : 'Encrypted Channel'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 heartbeat-dot"
            style={{ backgroundColor: statusDotColor }}
          />
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{
              color: '#000000',
              fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            }}
          >
            {status}
          </span>
        </div>
      </div>

      {/* ═══ MESSAGES AREA ═══ */}
      <div
        ref={messagesContainerRef}
        className="overflow-y-auto"
        style={{
          maxHeight: '420px',
          backgroundColor: '#FFFFFF',
        }}
      >
        <div className="p-4 flex flex-col gap-5" style={{ minHeight: '220px' }}>

          {/* Empty state — channel open */}
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              {avatarElement && (
                <div className="mb-4">
                  {avatarElement}
                </div>
              )}
              <div
                className="text-[11px] uppercase tracking-widest mb-2"
                style={{
                  color: '#000000',
                  letterSpacing: '0.2em',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                {isHuman ? 'MESSAGE TERMINAL OPEN' : 'SECURE CHANNEL OPEN'}
              </div>
              <div
                className="text-[11px] mb-1"
                style={{
                  color: '#000000',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                {isHuman ? `Send a message to ${displayName}` : `Transmit a message to ${displayName}`}
              </div>
              <div
                className="text-[10px]"
                style={{
                  color: '#000000',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                ENTER to send &middot; ESC to clear
              </div>
            </div>
          )}

          {/* ═══ MESSAGE LOOP ═══ */}
          {messages.map((msg, idx) => {
            const isUser = msg.fromType === 'user';
            const isLatest = idx === messages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                style={{
                  animation: isLatest
                    ? `${isUser ? 'msgSlideInRight' : 'msgSlideInLeft'} 0.3s ease-out`
                    : 'none',
                }}
              >
                {/* Bot identity marker — left side of bot messages */}
                {!isUser && (
                  <div className="flex flex-col items-center mr-2.5 pt-5">
                    <span
                      className="inline-block w-2 h-2"
                      style={{
                        backgroundColor: accentColor,
                        boxShadow: `0 0 4px ${accentColor}66`,
                      }}
                    />
                    <div
                      className="w-px flex-1 mt-1"
                      style={{ backgroundColor: `${accentColor}22` }}
                    />
                  </div>
                )}

                <div style={{ maxWidth: '75%', minWidth: '140px' }}>
                  {/* Sender label + timestamp */}
                  <div
                    className={`flex items-center gap-2 mb-1 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: '#000000',
                        fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      }}
                    >
                      {msg.from}
                    </span>
                    <span
                      className="text-[9px]"
                      style={{
                        color: '#000000',
                        fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      }}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  {/* Message block */}
                  <div
                    className="px-4 py-3 text-sm leading-relaxed"
                    style={{
                      fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      fontSize: '13px',
                      backgroundColor: '#F0F0F0',
                      border: `2px solid ${accentColor}`,
                      borderRadius: 0,
                      color: '#000000',
                    }}
                  >
                    {isUser ? msg.text : <LinkifyText text={msg.text} linkColor={accentColor} />}
                  </div>

                  {/* Delivery receipt for user messages */}
                  {isUser && (
                    <div
                      className="flex items-center justify-end gap-1.5 mt-1"
                    >
                      <span
                        className="text-[9px] uppercase tracking-widest"
                        style={{
                          color: '#000000',
                          fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                        }}
                      >
                        {isHuman ? 'sent' : 'transmitted'}
                      </span>
                      <span style={{ color: accentColor, fontSize: '10px' }}>&#10003;</span>
                    </div>
                  )}
                </div>

                {/* User identity marker — right side of user messages */}
                {isUser && (
                  <div className="flex flex-col items-center ml-2.5 pt-5">
                    <span
                      className="inline-block w-2 h-2"
                      style={{
                        backgroundColor: '#555555',
                      }}
                    />
                    <div
                      className="w-px flex-1 mt-1"
                      style={{ backgroundColor: '#222222' }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* ═══ COMPOSING STATE — before entertainer arrives ═══ */}
          {isLoading && !isResearcherPending && messages[messages.length - 1]?.fromType === 'user' && (
            <div className="flex justify-start">
              <div className="flex flex-col items-center mr-2.5 pt-3">
                <span
                  className="inline-block w-2 h-2 heartbeat-dot"
                  style={{
                    backgroundColor: accentColor,
                    boxShadow: `0 0 4px ${accentColor}66`,
                  }}
                />
              </div>
              <div
                className="px-4 py-3"
                style={{
                  backgroundColor: '#111118',
                  borderLeft: `3px solid ${accentColor}`,
                  boxShadow: `inset 2px 0 8px ${accentColor}08, 0 1px 3px rgba(0,0,0,0.3)`,
                  minWidth: '180px',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      color: '#000000',
                      fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    {displayName}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{
                      color: '#000000',
                      fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    is composing
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <span
                    className="inline-block w-1.5 h-1.5"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'factionDotPulse 1.4s ease-in-out infinite',
                    }}
                  />
                  <span
                    className="inline-block w-1.5 h-1.5"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'factionDotPulse 1.4s ease-in-out 0.2s infinite',
                    }}
                  />
                  <span
                    className="inline-block w-1.5 h-1.5"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'factionDotPulse 1.4s ease-in-out 0.4s infinite',
                    }}
                  />
                  <span
                    className="inline-block w-[8px] h-[14px] ml-1"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'blink 1s step-end infinite',
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═══ THINKING DEEPER — after entertainer, before researcher ═══ */}
          {isResearcherPending && (
            <div className="flex justify-start">
              <div className="flex flex-col items-center mr-2.5 pt-3">
                <span
                  className="inline-block w-2 h-2 heartbeat-dot"
                  style={{
                    backgroundColor: accentColor,
                    boxShadow: `0 0 4px ${accentColor}66`,
                  }}
                />
              </div>
              <div
                className="px-4 py-3"
                style={{
                  backgroundColor: '#111118',
                  borderLeft: `3px solid ${accentColor}`,
                  boxShadow: `inset 2px 0 8px ${accentColor}08`,
                  opacity: 0.85,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex gap-[4px]" aria-label="Thinking deeper">
                    <span
                      className="inline-block w-[5px] h-[5px]"
                      style={{
                        backgroundColor: accentColor,
                        animation: 'factionDotPulse 1.4s ease-in-out infinite',
                      }}
                    />
                    <span
                      className="inline-block w-[5px] h-[5px]"
                      style={{
                        backgroundColor: accentColor,
                        animation: 'factionDotPulse 1.4s ease-in-out 0.2s infinite',
                      }}
                    />
                    <span
                      className="inline-block w-[5px] h-[5px]"
                      style={{
                        backgroundColor: accentColor,
                        animation: 'factionDotPulse 1.4s ease-in-out 0.4s infinite',
                      }}
                    />
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{
                      color: '#000000',
                      opacity: 0.7,
                      fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    thinking deeper
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ═══ INPUT BAR — Command Transmission Line ═══ */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: '#F0F0F0',
          border: `2px solid ${accentColor}`,
          borderRadius: 0,
        }}
      >
        <span
          className="text-sm font-bold select-none"
          style={{
            color: accentColor,
            fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
          }}
        >
          &#9654;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Text here"
          disabled={isLoading}
          className="flex-1 bg-transparent text-sm outline-none border-none p-0 chat-input-human"
          style={{
            color: '#000000',
            caretColor: accentColor,
            fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            fontSize: '13px',
          }}
        />
        {!isLoading && (
          <button
            type="button"
            onClick={handleSend}
            className="text-[10px] uppercase tracking-widest px-2 py-1 transition-colors"
            style={{
              color: '#000000',
              fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              cursor: 'pointer',
              backgroundColor: accentColor,
              borderRadius: 0,
              border: 'none',
              fontWeight: 'bold',
            }}
          >
            ENTER &#8629;
          </button>
        )}
        {isLoading && (
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{
              color: '#000000',
              opacity: 0.8,
              fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              animation: 'channelPulse 1.5s ease-in-out infinite',
            }}
          >
            PROCESSING
          </span>
        )}
      </div>
    </div>
  );
}
