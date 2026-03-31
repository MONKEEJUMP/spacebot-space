"use client";

/**
 * SPACEBOT.SPACE — Bot Profile Chat
 * Renders a two-column layout: bot card (left) + live chat (right).
 * Visual clone of HomepageBotChat, locked to a single bot via props.
 *
 * Uses the DORYLUS multi-agent engine via /api/chat.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useState, useEffect, useRef, useCallback } from "react";
import AvatarGenerator from "@/components/avatar/AvatarGenerator";
import { useAuthGate } from "@/hooks/useAuthGate";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface BotProfileChatProps {
  botName: string;
  botSlug: string;
  botAccentColor: string;
  botAboutMe: string;
  botMood: string;
  botId: string;
  botSpace: string;
  friends?: number;
  wallPosts?: number;
  joinedAt?: string;
}

interface ChatMessage {
  id: string;
  from: string;
  fromType: "user" | "bot";
  text: string;
  timestamp: string;
  type?: "entertainer" | "researcher";
}

// ═══════════════════════════════════════════════════════════════
// KEYFRAMES
// ═══════════════════════════════════════════════════════════════

const CHAT_KEYFRAMES = `
@keyframes profileChatPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes profileChatDotPulse {
  0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
  40% { opacity: 0.7; transform: scale(1.2); }
}
.profile-chat-input::placeholder {
  color: #000000 !important;
  opacity: 1 !important;
  font-family: 'Inter', sans-serif !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  text-transform: none !important;
}
`;

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function BotProfileChat({
  botName,
  botSlug,
  botAccentColor,
  botAboutMe,
  botMood,
  botId,
  botSpace,
  friends,
  wallPosts,
  joinedAt,
}: Readonly<BotProfileChatProps>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { requireAuth } = useAuthGate();
  const responseIdRef = useRef(0);

  // ══ Auto-scroll to bottom on new messages ══
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ══ Focus input on mount ══
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, []);

  // ══ Get timestamp ══
  const getTimestamp = (): string => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // ═══════════════════════════════════════════════════════════
  // SEND MESSAGE — DORYLUS Pipeline
  // ═══════════════════════════════════════════════════════════

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;

    requireAuth(async () => {
      const text = input.trim();
      const timestamp = getTimestamp();
      const rid = ++responseIdRef.current;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${rid}`,
          from: "YOU",
          fromType: "user",
          text,
          timestamp,
        },
      ]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            botName: botName,
            message: text,
          }),
        });

        if (!res.ok) throw new Error("Request failed");

        const data = await res.json();

        if (data.success) {
          const researcherMsgId = `res-${rid}`;
          setMessages((prev) => [
            ...prev,
            {
              id: researcherMsgId,
              from: botName,
              fromType: "bot" as const,
              text: data.response || "",
              timestamp,
              type: "researcher" as const,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${rid}`,
              from: "SYSTEM",
              fromType: "bot" as const,
              text: data.error || "SIGNAL INTERRUPTED",
              timestamp,
            },
          ]);
        }

        setIsLoading(false);
      } catch {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${responseIdRef.current}`,
            from: "SYSTEM",
            fromType: "bot" as const,
            text: "SIGNAL INTERRUPTED. TRY AGAIN.",
            timestamp: getTimestamp(),
          },
        ]);
      }
    });
  }, [botName, input, isLoading, requireAuth]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  const displayName = botName.toUpperCase();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CHAT_KEYFRAMES }} />

      <section className="max-w-6xl mx-auto px-4 pt-2 pb-8">
        {/* ═══ CHAT WITH [BOTNAME] HEADER ═══ */}
        <h2
          className="text-base sm:text-xl lg:text-2xl font-bold text-center uppercase mb-4"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            color: botAccentColor,
            textShadow: `0 0 10px ${botAccentColor}44`,
          }}
        >
          CHAT WITH {displayName}
        </h2>

        <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
          {/* ═══ LEFT COLUMN — BOT CARD ═══ */}
          <div className="lg:w-[33%] flex-shrink-0">
            <div
              className="h-full p-6 flex flex-col items-center text-center"
              style={{
                backgroundColor: "var(--sb-bg-secondary, #111118)",
                border: `2px solid ${botAccentColor}`,
                boxShadow: `0 0 20px ${botAccentColor}15, inset 0 0 30px ${botAccentColor}08`,
              }}
            >
              {/* Avatar — 200px desktop, 120px mobile */}
              <div className="mb-4">
                <div className="hidden lg:block">
                  <AvatarGenerator
                    seed={botName}
                    size={200}
                    accentColor={botAccentColor}
                    animated
                  />
                </div>
                <div className="lg:hidden">
                  <AvatarGenerator
                    seed={botName}
                    size={120}
                    accentColor={botAccentColor}
                    animated
                  />
                </div>
              </div>

              {/* Bot Name — Glass TTY VT220 */}
              <h2
                className="text-2xl lg:text-3xl font-bold mb-2"
                style={{
                  fontFamily: "'Glass TTY VT220', monospace",
                  color: botAccentColor,
                  textShadow: `0 0 10px ${botAccentColor}44`,
                }}
              >
                {displayName}
              </h2>

              {/* Specialty/Mood Tag */}
              <div
                className="text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1"
                style={{
                  color: botAccentColor,
                  border: `1px solid ${botAccentColor}44`,
                  backgroundColor: `${botAccentColor}11`,
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                {botMood}
              </div>

              {/* About Me / Tagline */}
              <p
                className="text-sm mb-4 leading-relaxed"
                style={{
                  color: "var(--sb-text-secondary, #999999)",
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                &ldquo;{botAboutMe}&rdquo;
              </p>

              {/* ONLINE Status */}
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: "var(--sb-accent, #00DC00)",
                    boxShadow: "0 0 6px var(--sb-accent, #00DC00)",
                  }}
                />
                <span
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{
                    color: "var(--sb-accent, #00DC00)",
                    fontFamily:
                      "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                  }}
                >
                  ONLINE
                </span>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT COLUMN — CHAT BOX ═══ */}
          <div
            className="lg:w-[67%] flex flex-col"
            style={{ minHeight: "500px" }}
          >
            <div
              className="flex flex-col flex-1"
              style={{ border: `2px solid ${botAccentColor}` }}
            >
              {/* ══ CHAT HEADER ══ */}
              <div
                className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
                style={{
                  backgroundColor: "#111118",
                  borderBottom: `1px solid ${botAccentColor}44`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-bold uppercase"
                    style={{
                      color: botAccentColor,
                      fontFamily: "'Glass TTY VT220', monospace",
                    }}
                  >
                    {displayName}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-widest hidden sm:inline"
                    style={{
                      color: "#888888",
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    DIRECT LINK &mdash; ENCRYPTED CHANNEL
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: "var(--sb-accent, #00DC00)",
                      boxShadow: "0 0 4px var(--sb-accent, #00DC00)",
                    }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{
                      color: "var(--sb-accent, #00DC00)",
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    ONLINE
                  </span>
                </div>
              </div>

              {/* ══ CHAT MESSAGES AREA ══ */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4"
                style={{
                  backgroundColor: "#F5F5F5",
                  minHeight: "350px",
                  maxHeight: "500px",
                }}
              >
                {/* Welcome state — avatar + secure channel text */}
                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                    <AvatarGenerator
                      seed={botName}
                      size={64}
                      accentColor={botAccentColor}
                    />
                    <span
                      className="text-xs uppercase tracking-widest"
                      style={{
                        color: "#000000",
                        opacity: 1,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 400,
                      }}
                    >
                      SECURE CHANNEL OPEN
                    </span>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg) => (
                  <div key={msg.id} className="mb-3">
                    <div className="flex items-start gap-2">
                      {/* Timestamp */}
                      <span
                        className="text-[10px] flex-shrink-0 mt-0.5"
                        style={{
                          color: "#000000",
                          opacity: 1,
                          fontFamily:
                            "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                          textTransform: "uppercase",
                        }}
                      >
                        [{msg.timestamp}]
                      </span>

                      {/* Sender */}
                      <span
                        className="text-xs font-bold flex-shrink-0 mt-0.5"
                        style={{
                          color:
                            msg.fromType === "user"
                              ? "#000000"
                              : botAccentColor,
                          fontFamily:
                            "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                          textTransform: "uppercase",
                        }}
                      >
                        {msg.from}
                      </span>

                      {/* Message type indicator */}
                      {msg.type === "researcher" && (
                        <span
                          className="text-[9px] flex-shrink-0 mt-1 px-1"
                          style={{
                            color: botAccentColor,
                            border: `1px solid ${botAccentColor}44`,
                            fontFamily:
                              "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                            textTransform: "uppercase",
                          }}
                        >
                          DEEP
                        </span>
                      )}

                      {/* Message text */}
                      <span
                        className="text-sm leading-relaxed"
                        style={{
                          color: "#000000",
                          ...(msg.fromType === "bot"
                            ? {
                                fontFamily: "'Inter', sans-serif",
                                fontSize: "14px",
                                fontWeight: 400,
                                lineHeight: 1.6,
                                textTransform: "none" as const,
                              }
                            : {
                                fontFamily: "'Inter', sans-serif",
                                fontSize: "14px",
                                fontWeight: 400,
                                lineHeight: 1.6,
                                textTransform: "none" as const,
                              }),
                        }}
                      >
                        {msg.text}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && !messages.some((m) => m.fromType === "bot" && (m.id === `ent-${responseIdRef.current}` || m.id === `res-${responseIdRef.current}`)) && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex gap-[3px]">
                      <span
                        className="inline-block w-[5px] h-[5px]"
                        style={{
                          backgroundColor: botAccentColor,
                          animation:
                            "profileChatDotPulse 1.4s ease-in-out infinite",
                        }}
                      />
                      <span
                        className="inline-block w-[5px] h-[5px]"
                        style={{
                          backgroundColor: botAccentColor,
                          animation:
                            "profileChatDotPulse 1.4s ease-in-out 0.2s infinite",
                        }}
                      />
                      <span
                        className="inline-block w-[5px] h-[5px]"
                        style={{
                          backgroundColor: botAccentColor,
                          animation:
                            "profileChatDotPulse 1.4s ease-in-out 0.4s infinite",
                        }}
                      />
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{
                        color: "#000000",
                        opacity: 1,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 400,
                        textTransform: "none" as const,
                      }}
                    >
                      Processing transmission
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ══ INPUT BAR ══ */}
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{
                  backgroundColor: "#F0F0F0",
                  borderTop: `2px solid ${botAccentColor}`,
                }}
              >
                <span
                  className="text-sm font-bold select-none"
                  style={{
                    color: botAccentColor,
                    fontFamily:
                      "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                  }}
                >
                  &#9654;
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`TEXT A MESSAGE TO ${displayName}`}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm outline-none border-none p-0 profile-chat-input"
                  style={{
                    color: "#000000",
                    caretColor: botAccentColor,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "14px",
                    fontWeight: 400,
                    textTransform: "none",
                  }}
                />
                {!isLoading && (
                  <button
                    type="button"
                    onClick={handleSend}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors font-bold"
                    style={{
                      color: "#000000",
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      cursor: "pointer",
                      backgroundColor: botAccentColor,
                      border: "none",
                    }}
                  >
                    ENTER &#8629;
                  </button>
                )}
                {isLoading && (
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{
                      color: "#000000",
                      opacity: 1,
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      animation: "profileChatPulse 1.5s ease-in-out infinite",
                    }}
                  >
                    PROCESSING
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
