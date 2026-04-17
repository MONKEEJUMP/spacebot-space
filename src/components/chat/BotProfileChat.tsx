"use client";

/**
 * SPACEBOT.SPACE — Bot Profile Chat
 * Renders a two-column layout: bot card (left) + live chat (right).
 * Visual clone of HomepageBotChat, locked to a single bot via props.
 *
 * Uses /api/chat/stream for all bots and falls back to /api/chat.
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
  avatarSeed?: string;
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
  type?: "researcher";
}

interface BotStreamEvent {
  type?: "token" | "tool_start" | "tool_result" | "done" | "error";
  text?: string;
  tool?: string;
  message?: string;
  full_response?: string;
  latency_ms?: number;
}

interface JsonChatResponse {
  success?: boolean;
  response?: string;
  error?: string;
  conversationId?: string | null;
}

interface HistoryApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string | null;
}

interface HistoryApiResponse {
  success?: boolean;
  messages?: HistoryApiMessage[];
  conversationId?: string | null;
  error?: string;
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
@keyframes profileChatCursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.chat-magic-input {
  resize: none;
  caret-shape: block;
  caret-color: inherit;
}
.chat-magic-input::placeholder {
  color: #999;
  font-style: italic;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
}
.chat-magic-input:focus::placeholder {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.chat-magic-input:focus {
  outline: none;
}
`;

const TOOL_STATUS_LABELS: Record<string, { start: string; result: string }> = {
  api_caller: {
    start: "CHECKING EXTERNAL DATA",
    result: "EXTERNAL DATA RECEIVED",
  },
  server_health: {
    start: "CHECKING SERVER HEALTH",
    result: "SERVER HEALTH RECEIVED",
  },
  bot_communicator: {
    start: "CONTACTING ANOTHER BOT",
    result: "BOT RESPONSE RECEIVED",
  },
  code_interpreter: {
    start: "RUNNING CODE",
    result: "CODE EXECUTION COMPLETE",
  },
  web_extractor: {
    start: "READING THE WEB",
    result: "WEB DATA RECEIVED",
  },
};

function createBotSessionId(): string {
  return `bot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatHistoryTimestamp(createdAt?: string | null): string {
  if (!createdAt) return "";

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getCurrentTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getToolStatusText(
  tool: string | undefined,
  phase: "start" | "result",
): string {
  const normalizedTool = (tool || "").trim();
  const label = TOOL_STATUS_LABELS[normalizedTool]?.[phase];

  if (label) return label;
  if (!normalizedTool) {
    return phase === "start" ? "WORKING..." : "TOOL COMPLETE";
  }

  const prettyTool = normalizedTool.replaceAll(/[_-]+/g, " ").toUpperCase();
  return phase === "start"
    ? `${prettyTool} IN PROGRESS`
    : `${prettyTool} COMPLETE`;
}

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
  avatarSeed,
}: Readonly<BotProfileChatProps>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [streamingText, setStreamingText] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [streamTimestamp, setStreamTimestamp] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { requireAuth } = useAuthGate();
  const responseIdRef = useRef(0);
  const streamSessionIdRef = useRef("");

  const displayName = botName.toUpperCase();
  const hasLiveStream = Boolean(streamingText) || Boolean(streamStatus);

  // ══ Auto-scroll to bottom on new messages ══
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading, streamingText, streamStatus]);

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

  const resetStreamingState = useCallback(() => {
    setStreamingText("");
    setStreamStatus("");
    setStreamTimestamp("");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsHistoryLoading(true);
      setMessages([]);
      streamSessionIdRef.current = "";
      resetStreamingState();

      try {
        const res = await fetch(
          `/api/chat/history?botName=${encodeURIComponent(botName)}&limit=50`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          throw new Error(`History request failed with ${res.status}`);
        }

        const data = (await res.json()) as HistoryApiResponse;
        if (cancelled) return;

        const historyMessages = Array.isArray(data.messages)
          ? data.messages
          : [];

        setMessages(
          historyMessages.map((message) => ({
            id: message.id,
            from: message.role === "user" ? "YOU" : botName,
            fromType: message.role === "user" ? "user" : "bot",
            text: message.content,
            timestamp:
              formatHistoryTimestamp(message.createdAt) || getCurrentTimestamp(),
            type: undefined,
          })),
        );

        streamSessionIdRef.current =
          typeof data.conversationId === "string" ? data.conversationId : "";
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "[BotProfileChat] Failed to load history:",
            error instanceof Error ? error.message : error,
          );
          setMessages([]);
          streamSessionIdRef.current = "";
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [botName, resetStreamingState]);

  const appendBotMessage = useCallback(
    (rid: number, text: string, timestamp: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `res-${rid}`,
          from: botName,
          fromType: "bot",
          text,
          timestamp,
          type: undefined,
        },
      ]);
    },
    [botName],
  );

  const sendJsonFallback = useCallback(
    async (text: string, timestamp: string, rid: number) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          botName,
          message: text,
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = (await res.json()) as JsonChatResponse;

      if (typeof data.conversationId === "string" && data.conversationId) {
        streamSessionIdRef.current = data.conversationId;
      }

      if (data.success) {
        appendBotMessage(rid, data.response || "", timestamp);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${rid}`,
          from: "SYSTEM",
          fromType: "bot",
          text: data.error || "SIGNAL INTERRUPTED",
          timestamp,
        },
      ]);
    },
    [appendBotMessage, botName],
  );

  const sendStreamRequest = useCallback(
    async (text: string, timestamp: string, rid: number) => {
      const sessionId = streamSessionIdRef.current || createBotSessionId();
      streamSessionIdRef.current = sessionId;

      setStreamingText("");
      setStreamStatus("ESTABLISHING SECURE STREAM");
      setStreamTimestamp(timestamp);

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          botName,
          message: text,
          sessionId,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Streaming request failed");
      }

      const conversationId = res.headers.get("X-Conversation-Id");
      if (conversationId) {
        streamSessionIdRef.current = conversationId;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let completed = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;

            let data: BotStreamEvent;

            try {
              data = JSON.parse(line.slice(6)) as BotStreamEvent;
            } catch {
              continue;
            }

            if (data.type === "token" && data.text) {
              accumulated += data.text;
              setStreamingText(accumulated);
              setStreamStatus("");
            }

            if (data.type === "tool_start") {
              setStreamStatus(
                data.message
                  ? data.message.toUpperCase()
                  : getToolStatusText(data.tool, "start"),
              );
            }

            if (data.type === "tool_result") {
              setStreamStatus(
                data.message
                  ? data.message.toUpperCase()
                  : getToolStatusText(data.tool, "result"),
              );
            }

            if (data.type === "done") {
              const finalText =
                typeof data.full_response === "string" &&
                data.full_response.trim()
                  ? data.full_response
                  : accumulated;

              if (!finalText.trim()) {
                throw new Error("Stream ended without a response");
              }

              completed = true;
              appendBotMessage(rid, finalText, timestamp);
              resetStreamingState();
              return;
            }

            if (data.type === "error") {
              throw new Error(data.message || "Signal interrupted");
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!completed && accumulated.trim()) {
        appendBotMessage(rid, accumulated, timestamp);
        resetStreamingState();
        return;
      }

      throw new Error("Bot stream ended before completion");
    },
    [appendBotMessage, botName, resetStreamingState],
  );

  // ═══════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ═══════════════════════════════════════════════════════════

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || isHistoryLoading) return;

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

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
        }
      }, 0);

      setIsLoading(true);
      resetStreamingState();

      try {
        try {
          await sendStreamRequest(text, timestamp, rid);
          return;
        } catch (streamError) {
          console.warn(
            "[BotProfileChat] Stream fallback:",
            streamError instanceof Error ? streamError.message : streamError,
          );
          streamSessionIdRef.current = "";
          resetStreamingState();
        }

        await sendJsonFallback(text, timestamp, rid);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${rid}`,
            from: "SYSTEM",
            fromType: "bot",
            text: "SIGNAL INTERRUPTED. TRY AGAIN.",
            timestamp: getTimestamp(),
          },
        ]);
      } finally {
        setIsLoading(false);
        resetStreamingState();
        if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      }
    });
  }, [
    input,
    isHistoryLoading,
    isLoading,
    requireAuth,
    resetStreamingState,
    sendJsonFallback,
    sendStreamRequest,
  ]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CHAT_KEYFRAMES }} />

      <section
        className="flex flex-col w-full overflow-hidden"
        style={{ height: "100vh", backgroundColor: "#FFFFFF" }}
        aria-label={`Chat with ${displayName}`}
      >
        {/* ═══ SCROLLABLE MESSAGE AREA ═══ */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto"
          style={{
            padding: "20px",
          }}
        >
          {/* Empty state — SECURE CHANNEL OPEN */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
              <AvatarGenerator
                seed={avatarSeed || botName}
                isBot={true}
                size={64}
                accentColor={botAccentColor}
              />
              <span
                className="text-xs uppercase tracking-widest"
                style={{
                  color: "#999999",
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                }}
              >
                {isHistoryLoading
                  ? "LOADING TRANSMISSIONS"
                  : "SECURE CHANNEL OPEN"}
              </span>
            </div>
          )}

          {/* Messages — left/right aligned */}
          {messages.map((msg) => {
            const isUser = msg.fromType === "user";
            return (
              <div
                key={msg.id}
                className={`mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[80%]">
                  <div
                    className={`flex items-center gap-2 mb-1 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <span
                      className="text-[10px] font-bold"
                      style={{
                        color: isUser ? "#666666" : botAccentColor,
                        fontFamily:
                          "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                        textTransform: "uppercase",
                      }}
                    >
                      {msg.from}
                    </span>
                    {msg.type === "researcher" && (
                      <span
                        className="text-[9px] px-1"
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
                    <span
                      className="text-[9px]"
                      style={{
                        color: "#999999",
                        fontFamily:
                          "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      }}
                    >
                      [{msg.timestamp}]
                    </span>
                  </div>
                  <div
                    className="px-4 py-2"
                    style={{
                      backgroundColor: isUser ? "#F0F0F0" : "#FFFFFF",
                      border: isUser
                        ? "1px solid #E0E0E0"
                        : `1px solid ${botAccentColor}33`,
                      color: "#000000",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "14px",
                      fontWeight: 400,
                      lineHeight: 1.6,
                      borderRadius: "12px",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && hasLiveStream && (
            <div className="mb-4 flex justify-start">
              <div className="max-w-[80%]">
                <div className="flex items-center gap-2 mb-1 justify-start">
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: botAccentColor,
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                      textTransform: "uppercase",
                    }}
                  >
                    {displayName}
                  </span>
                  <span
                    className="text-[9px]"
                    style={{
                      color: "#999999",
                      fontFamily:
                        "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                    }}
                  >
                    [{streamTimestamp || getTimestamp()}]
                  </span>
                </div>
                <div
                  className="px-4 py-2"
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: `1px solid ${botAccentColor}33`,
                    color: "#000000",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "14px",
                    fontWeight: 400,
                    lineHeight: 1.6,
                    borderRadius: "12px",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {streamStatus && (
                    <div
                      className="mb-2 text-[10px]"
                      style={{
                        color: botAccentColor,
                        fontFamily:
                          "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      {streamStatus}
                    </div>
                  )}
                  <span>{streamingText || "Establishing secure stream..."}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "14px",
                      marginLeft: "3px",
                      backgroundColor: botAccentColor,
                      verticalAlign: "text-bottom",
                      animation: "profileChatCursorBlink 1s step-end infinite",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator — typing dots */}
          {isLoading && !hasLiveStream && (
            <div className="flex items-center gap-2 mt-2 justify-start">
              <span className="inline-flex gap-[3px]">
                <span
                  className="inline-block w-[5px] h-[5px]"
                  style={{
                    backgroundColor: botAccentColor,
                    animation: "profileChatDotPulse 1.4s ease-in-out infinite",
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
                className="text-[10px]"
                style={{
                  color: "#999999",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 400,
                }}
              >
                Processing transmission
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ═══ INPUT BUBBLE ═══ */}
        <div
          style={{
            padding: "12px 40px 20px 40px",
          }}
        >
          <div
            className="flex items-end gap-3"
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              padding: "12px 16px",
              backgroundColor: "#f0f0f0",
              border: "1px solid #e0e0e0",
              borderRadius: "0px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(
                  e.target.scrollHeight,
                  window.innerHeight * 0.3,
                )}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Text a message to ${displayName}...`}
              disabled={isLoading || isHistoryLoading}
              rows={1}
              className="chat-magic-input"
              style={{
                flex: 1,
                background: "transparent",
                color: "#000000",
                fontFamily: "'Inter', sans-serif",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: "1.4em",
                padding: "4px 0",
                border: "none",
                outline: "none",
                resize: "none",
                minHeight: "24px",
                maxHeight: "30vh",
                overflowY: "auto",
                caretColor: botAccentColor,
              }}
            />

            {isLoading ? (
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span
                  className="text-xs"
                  style={{
                    color: botAccentColor,
                    fontFamily: "'Inter', sans-serif",
                    animation: "profileChatPulse 1.5s ease-in-out infinite",
                  }}
                >
                  PROCESSING
                </span>
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || isHistoryLoading}
                className="text-sm font-bold tracking-wider"
                style={{
                  flexShrink: 0,
                  padding: "6px 16px",
                  backgroundColor: botAccentColor,
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "0px",
                  cursor:
                    input.trim() && !isHistoryLoading ? "pointer" : "default",
                  opacity: input.trim() && !isHistoryLoading ? 1 : 0.5,
                  fontFamily:
                    "'DEC Terminal Modern', 'Glass TTY VT220', monospace",
                  whiteSpace: "nowrap",
                }}
              >
                ENTER ↵
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
