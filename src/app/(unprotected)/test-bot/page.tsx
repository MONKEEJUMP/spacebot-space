'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'bot';
  text: string;
  meta?: {
    path?: string;
    tools_called?: string[];
    apis_found?: string[];
    latency_ms?: number;
    wingmen_completed?: number;
    total_tokens?: number;
    queryId?: string;
    status?: string;
  };
}

export default function TestBotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });

      const data = await res.json();

      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'bot',
          text: data.response,
          meta: {
            path: data.path,
            tools_called: data.tools_called,
            apis_found: data.apis_found,
            latency_ms: data.latency_ms,
            wingmen_completed: data.wingmen_completed,
            total_tokens: data.total_tokens,
            queryId: data.queryId,
            status: data.status,
          },
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'bot',
          text: `ERROR: ${data.error}`,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `NETWORK ERROR: ${err instanceof Error ? err.message : 'Unknown'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #222',
        fontSize: '14px',
        color: '#666',
      }}>
        SPACEBOT TEST BOT — APIs + LUCY Wingmen — No Personality — No Constraints
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#444', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
            Type a question below. APIs answer first, LUCY wingmen search the web for complex questions.<br />
            No bot personality. No constraints. No 3-sentence limit.<br />
            Try: &quot;What were the NHL scores last night?&quot;
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: msg.role === 'user' ? '#1a1a2e' : '#111',
            borderLeft: msg.role === 'user' ? '3px solid #4a9eff' : '3px solid #333',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            lineHeight: '1.6',
          }}>
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>
              {msg.role === 'user' ? 'YOU' : 'TEST BOT'}
            </div>
            {msg.text}
            {msg.meta && (
              <div style={{ fontSize: '11px', color: '#444', marginTop: '8px', borderTop: '1px solid #222', paddingTop: '6px' }}>
                Path: {msg.meta.path} | Latency: {msg.meta.latency_ms}ms
                {msg.meta.wingmen_completed !== undefined && msg.meta.wingmen_completed > 0 && (
                  <> | Wingmen: {msg.meta.wingmen_completed}/5</>
                )}
                {msg.meta.total_tokens !== undefined && msg.meta.total_tokens > 0 && (
                  <> | Tokens: {msg.meta.total_tokens}</>
                )}
                {msg.meta.tools_called && msg.meta.tools_called.length > 0 && (
                  <> | Tools: {msg.meta.tools_called.join(', ')}</>
                )}
                {msg.meta.apis_found && msg.meta.apis_found.length > 0 && (
                  <> | APIs: {msg.meta.apis_found.join(', ')}</>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            color: '#555',
            fontSize: '14px',
          }}>
            Querying APIs + LUCY wingmen...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid #222',
        display: 'flex',
        gap: '12px',
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything... NHL scores, weather, Bitcoin, news, AI analysis..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#e0e0e0',
            fontSize: '14px',
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 24px',
            backgroundColor: input.trim() && !loading ? '#4a9eff' : '#222',
            color: input.trim() && !loading ? '#fff' : '#555',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'monospace',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
