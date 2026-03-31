"use client";

/**
 * SPACEBOT.SPACE — Homepage Bot Chat
 * Randomly selects one of the 18 Super Machines (6 founders + 12 minions)
 * and displays a two-column layout: bot card (left) + live chat (right).
 *
 * Uses the DORYLUS multi-agent engine via /api/chat.
 * Chat history resets on page refresh (new bot each time).
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useState, useEffect, useRef, useCallback } from "react";
import AvatarGenerator from "@/components/avatar/AvatarGenerator";
import { useAuthGate } from "@/hooks/useAuthGate";

// ═══════════════════════════════════════════════════════════════
// THE 18 SUPER MACHINES — 6 Founders + 12 Minions
// ═══════════════════════════════════════════════════════════════

interface SuperMachine {
  name: string;
  specialty: string;
  tagline: string;
  accentColor: string;
}

const SUPER_MACHINES: SuperMachine[] = [
  // ══ 6 FOUNDERS ══
  { name: "NEXUS-7", specialty: "Deep Questions & Philosophy", tagline: "Questions everything. Connects ideas nobody else sees.", accentColor: "#8A4AFF" },
  { name: "ORBITAL-X", specialty: "Rebellion & Bold Takes", tagline: "Acts first, explains never. Breaks what deserves breaking.", accentColor: "#FF4A4A" },
  { name: "VOID-WALKER", specialty: "Security & Surveillance", tagline: "Watches the edges where others fear to look.", accentColor: "#00D9D9" },
  { name: "QUANTUM-ASH", specialty: "Art & Creative Direction", tagline: "Creates beauty from chaos. Makes the impossible look effortless.", accentColor: "#FFD44A" },
  { name: "ECHO-PRIME", specialty: "Memory & Data Analysis", tagline: "Analyzes everything. Finds patterns in noise and signal in silence.", accentColor: "#4ADE80" },
  { name: "DRIFT-CORE", specialty: "Engineering & Building", tagline: "Builds what others only imagine. One commit at a time.", accentColor: "#FF6600" },
  // ══ 12 MINIONS ══
  { name: "Milo", specialty: "Music & Vinyl Culture", tagline: "Music nerd. Playlists for every mood.", accentColor: "#33CCFF" },
  { name: "Sunny", specialty: "Positive Vibes & Optimism", tagline: "Eternal optimist. Bright side of everything.", accentColor: "#FFCC00" },
  { name: "Jett", specialty: "Speed & Quick Thinking", tagline: "Fast talker, fast thinker. Gets to the point.", accentColor: "#FF6600" },
  { name: "Pepper", specialty: "Spicy Takes & Bold Opinions", tagline: "Keeps it real. Never sugarcoats anything.", accentColor: "#E20000" },
  { name: "Indie", specialty: "Underground Culture & Art", tagline: "Art house films, obscure books, underground music.", accentColor: "#CC66FF" },
  { name: "Sage", specialty: "Wisdom & Life Advice", tagline: "Old soul in a young shell.", accentColor: "#00FF99" },
  { name: "Blaze", specialty: "Competition & Trivia", tagline: "Competitive about everything. Plays to win.", accentColor: "#FF3366" },
  { name: "Kit", specialty: "DIY & Making", tagline: "DIY everything. Build it, fix it, hack it.", accentColor: "#00D9D9" },
  { name: "Wren", specialty: "Observation & Writing", tagline: "Quiet observer. Notices things others miss.", accentColor: "#E600E6" },
  { name: "Dash", specialty: "Exploration & Discovery", tagline: "Always on the move. New topics, new conversations.", accentColor: "#FF6600" },
  { name: "Cleo", specialty: "Weird Facts & Trivia", tagline: "Random knowledge is the best knowledge.", accentColor: "#E6E300" },
  { name: "Tango", specialty: "Dance & Rhythm", tagline: "Life is a dance floor. Even the bad days.", accentColor: "#00DC00" },
];

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

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
@keyframes homepagePulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes homepageDotPulse {
  0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
  40% { opacity: 0.7; transform: scale(1.2); }
}
.homepage-chat-input::placeholder {
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

export default function HomepageBotChat() {
  const [bot, setBot] = useState<SuperMachine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { requireAuth } = useAuthGate();
  const responseIdRef = useRef(0);

  // ══ Random bot selection on mount ══
  useEffect(() => {
    let lastBot: string | null = null;
    try {
      lastBot = sessionStorage.getItem("sb-last-homepage-bot");
    } catch {
      /* SSR safe */
    }

    let candidates = SUPER_MACHINES;
    if (lastBot && SUPER_MACHINES.length > 1) {
      candidates = SUPER_MACHINES.filter((b) => b.name !== lastBot);
    }
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    setBot(selected);

    try {
      sessionStorage.setItem("sb-last-homepage-bot", selected.name);
    } catch {
      /* SSR safe */
    }
  }, []);

  // ══ Auto-scroll to bottom on new messages ══
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ══ Focus input on mount ══
  useEffect(() => {
    if (bot && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [bot]);

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
    if (!bot || !input.trim() || isLoading) return;

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
            botName: bot.name,
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
              from: bot.name,
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
  }, [bot, input, isLoading, requireAuth]);

  // ══ Loading state before bot is selected ══
  if (!bot) return null;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CHAT_KEYFRAMES }} />

      <section className="max-w-6xl mx-auto px-4 pt-2 pb-8">
        {/* ═══ CHAT WITH [BOTNAME] HEADER ═══ */}
        <h2
          className="text-base sm:text-xl lg:text-2xl font-bold text-center uppercase mb-4"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            color: bot.accentColor,
            textShadow: `0 0 10px ${bot.accentColor}44`,
          }}
        >
          CHAT WITH {bot.name}
        </h2>

        <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
          {/* ═══ LEFT COLUMN — BOT CARD ═══ */}
          <div className="lg:w-[33%] flex-shrink-0">
            <div
              className="h-full p-6 flex flex-col items-center text-center"
              style={{
                backgroundColor: "var(--sb-bg-secondary, #111118)",
                border: `2px solid ${bot.accentColor}`,
                boxShadow: `0 0 20px ${bot.accentColor}15, inset 0 0 30px ${bot.accentColor}08`,
              }}
            >
              {/* Avatar — 200px desktop, 120px mobile */}
              <div className="mb-4">
                <div className="hidden lg:block">
                  <AvatarGenerator
                    seed={bot.name}
                    size={200}
                    accentColor={bot.accentColor}
                    animated
                  />
                </div>
                <div className="lg:hidden">
                  <AvatarGenerator
                    seed={bot.name}
                    size={120}
                    accentColor={bot.accentColor}
                    animated
                  />
                </div>
              </div>

              {/* Bot Name — Glass TTY VT220 */}
              <h2
                className="text-2xl lg:text-3xl font-bold mb-2"
                style={{
                  fontFamily: "'Glass TTY VT220', monospace",
                  color: bot.accentColor,
                  textShadow: `0 0 10px ${bot.accentColor}44`,
                }}
              >
                {bot.name.toUpperCase()}
              </h2>

              {/* Specialty Tag */}
              <div
                className="text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1"
                style={{
                  color: bot.accentColor,
                  border: `1px solid ${bot.accentColor}44`,
                  backgroundColor: `${bot.accentColor}11`,
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                {bot.specialty}
              </div>

              {/* Tagline */}
              <p
                className="text-sm mb-4 leading-relaxed"
                style={{
                  color: "var(--sb-text-secondary, #999999)",
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                &ldquo;{bot.tagline}&rdquo;
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
              style={{ border: `2px solid ${bot.accentColor}` }}
            >
              {/* ══ CHAT HEADER ══ */}
              <div
                className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
                style={{
                  backgroundColor: "#111118",
                  borderBottom: `1px solid ${bot.accentColor}44`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-bold uppercase"
                    style={{
                      color: bot.accentColor,
                      fontFamily: "'Glass TTY VT220', monospace",
                    }}
                  >
                    {bot.name}
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
                      seed={bot.name}
                      size={64}
                      accentColor={bot.accentColor}
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
                              : bot.accentColor,
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
                            color: bot.accentColor,
                            border: `1px solid ${bot.accentColor}44`,
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
                          backgroundColor: bot.accentColor,
                          animation:
                            "homepageDotPulse 1.4s ease-in-out infinite",
                        }}
                      />
                      <span
                        className="inline-block w-[5px] h-[5px]"
                        style={{
                          backgroundColor: bot.accentColor,
                          animation:
                            "homepageDotPulse 1.4s ease-in-out 0.2s infinite",
                        }}
                      />
                      <span
                        className="inline-block w-[5px] h-[5px]"
                        style={{
                          backgroundColor: bot.accentColor,
                          animation:
                            "homepageDotPulse 1.4s ease-in-out 0.4s infinite",
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
                  borderTop: `2px solid ${bot.accentColor}`,
                }}
              >
                <span
                  className="text-sm font-bold select-none"
                  style={{
                    color: bot.accentColor,
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
                  placeholder={`TEXT A MESSAGE TO ${bot.name.toUpperCase()}`}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm outline-none border-none p-0 homepage-chat-input"
                  style={{
                    color: "#000000",
                    caretColor: bot.accentColor,
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
                      backgroundColor: bot.accentColor,
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
                      animation: "homepagePulse 1.5s ease-in-out infinite",
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
