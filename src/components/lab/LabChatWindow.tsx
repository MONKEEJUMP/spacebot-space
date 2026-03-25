'use client';

import { useMemo, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { LabBotDefinition, LabChatHistoryMessage, LabChatResponsePart } from '@/types/lab';
import LabBotHeader from './LabBotHeader';
import LabMessageList, { type LabUiMessage } from './LabMessageList';
import LabChatInput from './LabChatInput';
import { useAuthGate } from '@/hooks/useAuthGate';

interface LabChatWindowProps {
  bot: LabBotDefinition;
}

/* ─── BotSpace World / Books chat theme for LabSpace ─── */
const LAB_WORLD_STYLES = `
.lab-chat-world > div {
  border-color: #0000AA !important;
  border-radius: 0 !important;
}
.lab-chat-world > div:nth-of-type(2) {
  background-color: #F0F0F0 !important;
}
.lab-chat-world > div:nth-of-type(3) {
  background-color: #F0F0F0 !important;
}
.lab-chat-world .leading-relaxed {
  color: #0C0C0C !important;
  background-color: transparent !important;
  font-family: monospace !important;
  border-left-color: #0000AA !important;
  border-right-color: #0000AA !important;
}
.lab-chat-world [class*="text-[11px]"] {
  color: #0000AA !important;
}
.lab-chat-world .text-center p {
  color: #666666 !important;
}
.lab-chat-world .flex.flex-col.gap-4 > .text-sm {
  color: #0000AA !important;
}
.lab-chat-world .select-none {
  color: #0000AA !important;
}
.lab-chat-world input {
  color: #0C0C0C !important;
  caret-color: #0000AA !important;
  font-family: monospace !important;
}
.lab-chat-world input::placeholder {
  color: #999999 !important;
}
.lab-chat-world button {
  background-color: #0000AA !important;
  color: #FFFFFF !important;
  border-color: #0000AA !important;
  border-radius: 0 !important;
}
.lab-chat-world button:hover:not(:disabled) {
  background-color: #0000DD !important;
  border-color: #0000DD !important;
}
.lab-chat-world .tracking-wide {
  color: #0000AA99 !important;
}
.lab-chat-world [class*="rounded-full"] {
  background-color: #0000AA !important;
}
.lab-chat-world .py-1.pl-3 {
  border-left-color: #0000AA40 !important;
}
`;

function nowTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function LabChatWindow({ bot }: Readonly<LabChatWindowProps>) {
  const [messages, setMessages] = useState<LabUiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResearcherPending, setIsResearcherPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { requireAuth } = useAuthGate();

  const history = useMemo<LabChatHistoryMessage[]>(
    () =>
      messages
        .filter((m) => m.type !== 'entertainer') // Only researcher answers as history context
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  const sendMessage = useCallback(
    (message: string): void => {
      requireAuth(async () => {
      setErrorMessage(null);

      const userMessage: LabUiMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: nowTime(),
      };

      setMessages((previous) => [...previous, userMessage]);
      setIsLoading(true);
      setIsResearcherPending(false);

      try {
        const response = await fetch('/api/v1/lab/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            botSlug: bot.slug,
            message,
            conversationHistory: history,
          }),
        });

        // Auth is handled by requireAuth hook

        // ─────────────────────────────────────────────────────────
        // Auto-detect response format: SSE streaming vs JSON
        // ─────────────────────────────────────────────────────────
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          // ═══════════════════════════════════════════════════════
          // SSE STREAMING — The Real Innovation
          // Entertainer arrives INSTANTLY. Researcher follows.
          // Two independent deliveries. Zero fake delays.
          // ═══════════════════════════════════════════════════════

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Stream reader unavailable');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer (split on double newline)
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || ''; // Keep incomplete chunk in buffer

            for (const chunk of chunks) {
              const line = chunk.trim();
              if (!line.startsWith('data: ')) continue;

              let data: {
                type?: string;
                content?: string;
                botName?: string;
                provider?: string;
                model?: string;
                message?: string;
              };

              try {
                data = JSON.parse(line.slice(6));
              } catch {
                continue; // Skip malformed events
              }

              if (data.type === 'entertainer' && data.content) {
                // ── Entertainer arrived — show IMMEDIATELY ──
                // flushSync forces React to paint before processing next event.
                const entertainerMsg: LabUiMessage = {
                  id: `e-${Date.now()}`,
                  role: 'assistant',
                  content: data.content,
                  timestamp: nowTime(),
                  type: 'entertainer',
                };
                flushSync(() => {
                  setMessages((prev) => [...prev, entertainerMsg]);
                  setIsResearcherPending(true);
                });
              }

              if (data.type === 'researcher' && data.content) {
                // ── Researcher arrived — the real answer ──
                // flushSync ensures this renders immediately.
                const researcherMsg: LabUiMessage = {
                  id: `r-${Date.now()}`,
                  role: 'assistant',
                  content: data.content,
                  timestamp: nowTime(),
                  type: 'researcher',
                };
                flushSync(() => {
                  setMessages((prev) => [...prev, researcherMsg]);
                  setIsResearcherPending(false);
                });
              }

              if (data.type === 'done') {
                // Stream complete
                flushSync(() => {
                  setIsLoading(false);
                  setIsResearcherPending(false);
                });
              }

              if (data.type === 'error') {
                flushSync(() => {
                  setErrorMessage(data.message || 'Something went wrong');
                  setIsLoading(false);
                  setIsResearcherPending(false);
                });
              }
            }
          }
        } else {
          // ═══════════════════════════════════════════════════════
          // JSON FALLBACK — Safety redirects, legacy, non-SSE
          // ═══════════════════════════════════════════════════════

          const payload = (await response.json()) as {
            success?: boolean;
            response?: string;
            parts?: LabChatResponsePart[];
            error?: string;
          };

          if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'Unable to process lab message');
          }

          if (typeof payload.response === 'string') {
            // Single response — safety redirects
            const assistantMessage: LabUiMessage = {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: payload.response,
              timestamp: nowTime(),
            };
            setMessages((previous) => [...previous, assistantMessage]);
          } else if (payload.parts && payload.parts.length > 0) {
            // Bundled JSON parts (backward compat — shouldn't normally hit this)
            for (const part of payload.parts) {
              const msg: LabUiMessage = {
                id: `${part.type[0]}-${Date.now()}-${Math.random()}`,
                role: 'assistant',
                content: part.content,
                timestamp: nowTime(),
                type: part.type,
              };
              setMessages((previous) => [...previous, msg]);
            }
          }
        }
      } catch (error) {
        const fallbackMessage = error instanceof Error ? error.message : 'Lab chat temporarily unavailable';
        setErrorMessage(fallbackMessage);

        setMessages((previous) => [
          ...previous,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: `${bot.name}: Signal interrupted. Please try again.`,
            timestamp: nowTime(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setIsResearcherPending(false);
      }
      });
    },
    [bot.slug, bot.name, history, requireAuth],
  );

  return (
    <div className="lab-chat-world">
      <style dangerouslySetInnerHTML={{ __html: LAB_WORLD_STYLES }} />
      <LabBotHeader bot={bot} />
      <LabMessageList
        bot={bot}
        messages={messages}
        isLoading={isLoading}
        isResearcherPending={isResearcherPending}
      />
      <LabChatInput
        onSend={sendMessage}
        disabled={isLoading}
        placeholder="Text here"
      />

      {errorMessage && (
        <div className="mt-3 text-sm" style={{ color: '#E20000' }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
