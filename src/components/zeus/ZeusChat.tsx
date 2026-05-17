'use client';

/**
 * ZEUS CHAT — Private Terminal Interface
 * The direct line between PAULIEWOOD and Zeus.
 * Only visible on own profile (isOwnProfile === true).
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthGate } from '@/hooks/useAuthGate';

// ═══ TYPES ═══

interface ZeusMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

// ═══ KEYFRAMES ═══

const ZEUS_KEYFRAMES = `
@keyframes zeusBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes zeusSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes zeusPulse {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 0.8; }
}
`;

// ═══ COMPONENT ═══

export default function ZeusChat() {
  const [messages, setMessages] = useState<ZeusMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { requireAuth } = useAuthGate();

  // ── Auto-scroll ──
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // ── Load conversation history on mount ──
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/v1/zeus/history');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.messages) {
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              createdAt: m.createdAt,
            }))
          );
        }
      } catch {
        // Silent fail — history is supplementary
      } finally {
        setHistoryLoaded(true);
      }
    }
    loadHistory();
  }, []);

  // ── Focus input on mount ──
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // ── Send message ──
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    requireAuth(async () => {

    const userMsg: ZeusMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    try {
      const response = await fetch('/api/v1/zeus/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data: ')) continue;

          let data: { token?: string; done?: boolean; full_response?: string; error?: boolean; message?: string };
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (data.token) {
            accumulated += data.token;
            setStreamingText(accumulated);
          }

          if (data.done) {
            const finalText = data.full_response || accumulated;
            const zeusMsg: ZeusMessage = {
              id: `zeus-${Date.now()}`,
              role: 'assistant',
              content: finalText,
            };
            setMessages((prev) => [...prev, zeusMsg]);
            setStreamingText('');
            setIsStreaming(false);
          }

          if (data.error) {
            const errorMsg: ZeusMessage = {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: data.message || 'Signal disrupted. Try again.',
            };
            setMessages((prev) => [...prev, errorMsg]);
            setStreamingText('');
            setIsStreaming(false);
          }
        }
      }
    } catch {
      const errorMsg: ZeusMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Connection to Zeus lost. Try again.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      if (inputRef.current) inputRef.current.focus();
    }
    });
  }, [input, isStreaming, requireAuth]);

  // ── Format timestamp ──
  const formatTime = (createdAt?: string) => {
    if (!createdAt) return '';
    const d = new Date(createdAt);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div
      style={{
        border: '1px solid #5200FF',
        backgroundColor: '#0a0a0a',
        fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: ZEUS_KEYFRAMES }} />

      {/* ═══ HEADER ═══ */}
      <div
        style={{
          backgroundColor: '#0d0d0d',
          borderBottom: '1px solid #5200FF',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              border: '1px solid #5200FF',
              color: '#5200FF',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            &#9889;
          </span>
          <div>
            <div
              style={{
                color: '#5200FF',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
              }}
            >
              ZEUS TERMINAL
            </div>
            <div style={{ color: '#336633', fontSize: '10px' }}>
              Private Channel &mdash; Encrypted
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#5200FF',
              boxShadow: '0 0 4px #5200FF88',
            }}
          />
          <span
            style={{
              color: '#5200FF',
              fontSize: '10px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.1em',
            }}
          >
            ONLINE
          </span>
        </div>
      </div>

      {/* ═══ MESSAGES ═══ */}
      <div
        ref={containerRef}
        style={{
          maxHeight: '400px',
          overflowY: 'auto' as const,
          padding: '16px',
          minHeight: '200px',
        }}
      >
        {/* Loading state */}
        {!historyLoaded && (
          <div style={{ color: '#336633', fontSize: '12px', textAlign: 'center' as const, padding: '24px 0' }}>
            Loading transmissions...
          </div>
        )}

        {/* Empty state */}
        {historyLoaded && messages.length === 0 && !isStreaming && (
          <div style={{ textAlign: 'center' as const, padding: '40px 0' }}>
            <div
              style={{
                color: '#5200FF',
                fontSize: '11px',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.2em',
                marginBottom: '8px',
                animation: 'zeusBlink 2s step-end infinite',
              }}
            >
              ZEUS AWAITS
            </div>
            <div style={{ color: '#336633', fontSize: '11px' }}>
              Type a message to begin your private session.
            </div>
          </div>
        )}

        {/* Message history */}
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isLatest = idx === messages.length - 1;

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: '12px',
                animation: isLatest ? 'zeusSlideIn 0.3s ease-out' : 'none',
              }}
            >
              <div style={{ maxWidth: '80%' }}>
                {/* Attribution line */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isUser && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '14px',
                        height: '14px',
                        border: '1px solid #3D00CC',
                        color: '#5200FF',
                        fontSize: '8px',
                      }}
                    >
                      &#9889;
                    </span>
                  )}
                  <span
                    style={{
                      color: isUser ? '#666666' : '#5200FF',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.1em',
                    }}
                  >
                    {isUser ? 'YOU' : 'ZEUS'}
                  </span>
                  {msg.createdAt && (
                    <span style={{ color: '#333333', fontSize: '9px' }}>
                      {formatTime(msg.createdAt)}
                    </span>
                  )}
                </div>

                {/* Message bubble */}
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    backgroundColor: isUser ? '#111411' : '#0d120d',
                    color: isUser ? '#aaaaaa' : '#5200FF',
                    borderLeft: isUser ? 'none' : '2px solid #5200FF',
                    borderRight: isUser ? '2px solid #444444' : 'none',
                    whiteSpace: 'pre-wrap' as const,
                    wordBreak: 'break-word' as const,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}

        {/* Streaming response */}
        {isStreaming && streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{ maxWidth: '80%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    border: '1px solid #3D00CC',
                    color: '#5200FF',
                    fontSize: '8px',
                  }}
                >
                  &#9889;
                </span>
                <span
                  style={{
                    color: '#5200FF',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                  }}
                >
                  ZEUS
                </span>
              </div>
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  backgroundColor: '#0d120d',
                  color: '#5200FF',
                  borderLeft: '2px solid #5200FF',
                  whiteSpace: 'pre-wrap' as const,
                  wordBreak: 'break-word' as const,
                }}
              >
                {streamingText}
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '14px',
                    backgroundColor: '#5200FF',
                    marginLeft: '2px',
                    verticalAlign: 'text-bottom',
                    animation: 'zeusBlink 1s step-end infinite',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Thinking state */}
        {isStreaming && !streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#0d120d',
                borderLeft: '2px solid #5200FF',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'flex', gap: '4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '5px',
                      height: '5px',
                      backgroundColor: '#5200FF',
                      animation: 'zeusPulse 1.4s ease-in-out infinite',
                    }}
                  />
                  <span
                    style={{
                      display: 'inline-block',
                      width: '5px',
                      height: '5px',
                      backgroundColor: '#5200FF',
                      animation: 'zeusPulse 1.4s ease-in-out 0.2s infinite',
                    }}
                  />
                  <span
                    style={{
                      display: 'inline-block',
                      width: '5px',
                      height: '5px',
                      backgroundColor: '#5200FF',
                      animation: 'zeusPulse 1.4s ease-in-out 0.4s infinite',
                    }}
                  />
                </span>
                <span style={{ color: '#336633', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
                  Zeus is processing
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ═══ INPUT BAR ═══ */}
      <div
        style={{
          borderTop: '1px solid #5200FF',
          backgroundColor: '#0d0d0d',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: '#5200FF', fontSize: '14px', fontWeight: 'bold' }}>&#9654;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Talk to Zeus..."
          disabled={isStreaming}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#5200FF',
            fontSize: '13px',
            fontFamily: "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
            caretColor: '#5200FF',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #5200FF66',
            color: isStreaming || !input.trim() ? '#336633' : '#5200FF',
            padding: '4px 12px',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
            transition: 'border-color 0.2s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
