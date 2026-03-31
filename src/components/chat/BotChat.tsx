'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useAuthGate } from '@/hooks/useAuthGate';
import ChatMessage from './ChatMessage';
import type { ChatMessageData } from './ChatMessage';

interface BotChatProps {
  botName: string;
  botDisplayName: string;
  botTagline?: string;
}

const CHAT_KEYFRAMES = `
@keyframes botChatDotPulse {
  0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
  40% { opacity: 0.7; transform: scale(1.2); }
}
.bot-chat-input::placeholder {
  color: var(--sb-text-secondary, #767676);
}
`;

export default function BotChat({ botName, botDisplayName, botTagline }: Readonly<BotChatProps>) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { requireAuth } = useAuthGate();
  const { isSignedIn, isLoaded } = useUser();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount when signed in
  useEffect(() => {
    if (isLoaded && isSignedIn && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isLoaded, isSignedIn]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || isLoading) return;

    requireAuth(async () => {
      const text = input.trim();

      const userMessage: ChatMessageData = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const loadingMessage: ChatMessageData = {
        id: `b-${Date.now()}`,
        role: 'bot',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput('');
      setIsLoading(true);

      // Reset textarea height after clearing
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botName, message: text }),
        });

        const data = await response.json();

        if (data.success) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessage.id
                ? {
                    ...msg,
                    content: data.response,
                    isLoading: false,
                    metrics: data.metrics,
                  }
                : msg,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessage.id
                ? {
                    ...msg,
                    content: data.error || 'Something went wrong. Please try again.',
                    isLoading: false,
                    isError: true,
                  }
                : msg,
            ),
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingMessage.id
              ? {
                  ...msg,
                  content: 'Network error. Please check your connection and try again.',
                  isLoading: false,
                  isError: true,
                }
              : msg,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    });
  }, [input, isLoading, botName, requireAuth]);

  const inputDisabled = isLoading || (isLoaded && !isSignedIn);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CHAT_KEYFRAMES }} />

      <div
        className="flex flex-col"
        style={{
          border: '1px solid var(--sb-border-primary, #333333)',
          backgroundColor: 'var(--sb-bg-primary, #0a0a0a)',
          height: '500px',
        }}
      >
        {/* HEADER */}
        <div
          className="px-4 py-3 flex items-center justify-between flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--sb-border-primary, #333333)',
            backgroundColor: 'var(--sb-bg-secondary, #111118)',
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-bold uppercase"
              style={{
                color: 'var(--sb-accent, #00DC00)',
                fontFamily: "'Glass TTY VT220', monospace",
              }}
            >
              {botDisplayName}
            </span>
            {botTagline && (
              <span
                className="text-[10px] uppercase tracking-widest hidden sm:inline"
                style={{
                  color: 'var(--sb-text-secondary, #767676)',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                &mdash; {botTagline}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: 'var(--sb-accent, #00DC00)',
                boxShadow: '0 0 4px var(--sb-accent, #00DC00)',
              }}
            />
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{
                color: 'var(--sb-accent, #00DC00)',
                fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              }}
            >
              ONLINE
            </span>
          </div>
        </div>

        {/* MESSAGES AREA */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-4"
          style={{ backgroundColor: 'var(--sb-bg-primary, #0a0a0a)' }}
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12">
              <p
                className="text-xs uppercase tracking-widest"
                style={{
                  color: 'var(--sb-text-secondary, #767676)',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                --- SECURE CHANNEL OPEN ---
              </p>
              <p
                className="text-sm mt-2"
                style={{
                  color: 'var(--sb-text-primary, #CCCCCC)',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                Ask {botDisplayName} anything.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} botDisplayName={botDisplayName} />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div
          className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--sb-border-primary, #333333)',
            backgroundColor: 'var(--sb-bg-secondary, #111118)',
          }}
        >
          {isLoaded && !isSignedIn ? (
            <span
              className="text-xs uppercase tracking-widest flex-1 text-center py-1"
              style={{
                color: 'var(--sb-text-secondary, #767676)',
                fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
              }}
            >
              SIGN IN TO CHAT WITH {botDisplayName}
            </span>
          ) : (
            <>
              <span
                className="text-sm font-bold select-none flex-shrink-0"
                style={{
                  color: 'var(--sb-accent, #00DC00)',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                &gt;
              </span>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={inputDisabled}
                placeholder={`Message ${botDisplayName}...`}
                rows={1}
                className="flex-1 bg-transparent text-sm outline-none border-none p-0 resize-none bot-chat-input"
                style={{
                  color: 'var(--sb-text-primary, #CCCCCC)',
                  caretColor: 'var(--sb-accent, #00DC00)',
                  fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              />
              {!isLoading ? (
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={inputDisabled || !input.trim()}
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 cursor-pointer transition-opacity disabled:opacity-30 flex-shrink-0"
                  style={{
                    color: 'var(--sb-bg-primary, #0a0a0a)',
                    backgroundColor: 'var(--sb-accent, #00DC00)',
                    fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    border: 'none',
                  }}
                >
                  ENTER &#8629;
                </button>
              ) : (
                <span
                  className="text-[10px] uppercase tracking-widest flex-shrink-0"
                  style={{
                    color: 'var(--sb-accent, #00DC00)',
                    fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    animation: 'botChatDotPulse 1.5s ease-in-out infinite',
                  }}
                >
                  PROCESSING
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
