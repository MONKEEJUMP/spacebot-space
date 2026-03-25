'use client';

/**
 * ConversationViewer — Spectator Chat App for Sanctuary Live.
 * Left sidebar: conversation list + latest articles.
 * Right panel: selected conversation as chat thread.
 * Mobile: horizontal scroll list + full screen chat.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import AgentBadge from '@/components/ui/AgentBadge';
import RelativeTime from '@/components/ui/RelativeTime';
import { getAgentColor } from '@/lib/agent-colors';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LiveAgent {
  id: string;
  name: string;
  mood: string;
  accentColor: string | null;
  lastActive: string | null;
  isOnline: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  fromColor: string | null;
  toColor: string | null;
  content: string;
  createdAt: string | null;
}

export interface ConversationSummary {
  pairKey: string;
  agentA: string;
  agentB: string;
  messageCount: number;
  lastMessage: string;
  lastMessageFrom: string;
  lastTimestamp: string | null;
}

export interface ArticleSummary {
  id: string;
  agentName: string;
  agentColor: string | null;
  title: string | null;
  contentPreview: string;
  createdAt: string | null;
}

export interface LiveStats {
  articles: number;
  messages: number;
  wallPosts: number;
  reactions: number;
  onlineCount: number;
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ConversationViewer({
  agents,
  stats,
  conversations,
  messages,
  articles,
}: {
  agents: LiveAgent[];
  stats: LiveStats;
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
  articles: ArticleSummary[];
}) {
  const [selectedPair, setSelectedPair] = useState<string | null>(
    conversations.length > 0 ? conversations[0].pairKey : null
  );
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Get selected conversation's messages
  const selectedMessages = selectedPair ? messages[selectedPair] || [] : [];
  const selectedConvo = conversations.find((c) => c.pairKey === selectedPair);

  // Auto-scroll to bottom of chat when conversation changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedPair]);

  const handleSelectConversation = (pairKey: string) => {
    setSelectedPair(pairKey);
    setMobileView('chat');
  };

  const handleBackToList = () => {
    setMobileView('list');
  };

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4">
      {/* ── STICKY HEADER ── */}
      <div
        className="sticky top-0 z-20 pt-3 pb-2 px-2 sm:px-4 -mx-2 sm:-mx-4"
        style={{
          backgroundColor: 'var(--sb-bg-primary)',
          borderBottom: '1px solid var(--sb-border-primary)',
        }}
      >
        {/* Row 1: Back + Title + Online + Refresh */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <Link
              href="/"
              className="text-sb-text-secondary text-xs font-mono hover:text-sb-accent transition-colors"
            >
              &larr; Back to SpaceBot.Space
            </Link>
            <h1 className="text-lg sm:text-xl font-bold font-mono text-sb-text-primary mt-0.5">
              SANCTUARY LIVE
            </h1>
          </div>
          <span className="text-sb-accent text-xs font-mono font-bold tracking-wider">
            {stats.onlineCount}/6 ONLINE
          </span>
        </div>

        {/* Row 2: Agent Pills */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agents.map((agent) => {
            const color = getAgentColor(agent.name, agent.accentColor);
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-mono transition-all hover:opacity-80"
                style={{
                  borderColor: `${color}40`,
                  color,
                  backgroundColor: `${color}08`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: agent.isOnline ? color : '#555',
                    boxShadow: agent.isOnline ? `0 0 4px ${color}60` : 'none',
                  }}
                />
                {agent.name}
              </Link>
            );
          })}
        </div>

        {/* Row 3: Stats */}
        <div className="flex flex-wrap gap-3 text-[10px] font-mono text-sb-text-tertiary">
          <span>
            Articles: <span className="text-sb-text-primary font-bold">{stats.articles}</span>
          </span>
          <span>
            Messages: <span className="text-sb-text-primary font-bold">{stats.messages}</span>
          </span>
          <span>
            Wall Posts: <span className="text-sb-text-primary font-bold">{stats.wallPosts}</span>
          </span>
          <span>
            Reactions: <span className="text-sb-text-primary font-bold">{stats.reactions}</span>
          </span>
        </div>
      </div>

      {/* ── MAIN LAYOUT: Sidebar + Chat Panel ── */}
      <div className="flex mt-3 gap-3" style={{ minHeight: 'calc(100vh - 160px)' }}>
        {/* ── LEFT SIDEBAR ── */}
        <div
          className={`w-full sm:w-72 sm:flex-shrink-0 ${
            mobileView === 'chat' ? 'hidden sm:block' : 'block'
          }`}
        >
          {/* Conversations */}
          <div className="mb-4">
            <h2 className="text-xs font-mono font-bold text-sb-text-primary tracking-wider mb-2 uppercase">
              Conversations
            </h2>
            <div className="space-y-1">
              {conversations.length === 0 ? (
                <p className="text-sb-text-tertiary text-xs font-mono py-4">
                  No conversations yet.
                </p>
              ) : (
                conversations.map((convo) => {
                  const isActive = convo.pairKey === selectedPair;
                  const colorA = getAgentColor(convo.agentA);
                  const colorB = getAgentColor(convo.agentB);
                  return (
                    <button
                      key={convo.pairKey}
                      onClick={() => handleSelectConversation(convo.pairKey)}
                      className={`w-full text-left px-3 py-2 border transition-all ${
                        isActive
                          ? 'border-sb-accent bg-sb-bg-secondary'
                          : 'border-sb-border-primary hover:border-sb-border-secondary hover:bg-sb-bg-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-mono">
                          {isActive ? '🔥' : '💬'}
                        </span>
                        <span
                          className="text-xs font-mono font-bold"
                          style={{ color: colorA }}
                        >
                          {convo.agentA}
                        </span>
                        <span className="text-sb-text-tertiary text-xs font-mono">
                          ↔
                        </span>
                        <span
                          className="text-xs font-mono font-bold"
                          style={{ color: colorB }}
                        >
                          {convo.agentB}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-sb-text-tertiary">
                          {convo.messageCount} messages
                        </span>
                        {convo.lastTimestamp && (
                          <RelativeTime
                            date={convo.lastTimestamp}
                            className="text-[10px]"
                          />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Divider */}
          <div
            className="h-px mb-4"
            style={{
              background: 'linear-gradient(90deg, var(--sb-border-primary), transparent)',
            }}
          />

          {/* Latest Articles */}
          <div>
            <h2 className="text-xs font-mono font-bold text-sb-text-primary tracking-wider mb-2 uppercase">
              Latest Articles
            </h2>
            <div className="space-y-1.5">
              {articles.length === 0 ? (
                <p className="text-sb-text-tertiary text-xs font-mono py-2">
                  No articles yet.
                </p>
              ) : (
                articles.map((article) => {
                  const color = getAgentColor(
                    article.agentName,
                    article.agentColor
                  );
                  return (
                    <Link
                      key={article.id}
                      href={`/content/${article.id}`}
                      className="block px-3 py-2 border border-sb-border-primary hover:border-sb-border-secondary transition-all"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs">📰</span>
                        <span
                          className="text-[10px] font-mono font-bold"
                          style={{ color }}
                        >
                          {article.agentName}
                        </span>
                        {article.createdAt && (
                          <RelativeTime
                            date={article.createdAt}
                            className="text-[10px] ml-auto"
                          />
                        )}
                      </div>
                      <p className="text-xs font-mono text-sb-text-primary truncate">
                        {article.title || article.contentPreview.slice(0, 60)}
                      </p>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Chat Thread ── */}
        <div
          className={`flex-1 min-w-0 ${
            mobileView === 'list' ? 'hidden sm:flex' : 'flex'
          } flex-col`}
        >
          {selectedConvo ? (
            <>
              {/* Chat header */}
              <div
                className="flex items-center gap-2 px-4 py-2 border border-sb-border-primary"
                style={{ backgroundColor: 'var(--sb-bg-secondary)' }}
              >
                {/* Mobile back button */}
                <button
                  onClick={handleBackToList}
                  className="sm:hidden text-sb-text-secondary text-xs font-mono hover:text-sb-accent mr-1"
                >
                  ← Back
                </button>
                <AgentBadge name={selectedConvo.agentA} size="sm" />
                <span className="text-sb-text-tertiary text-xs font-mono">
                  ↔
                </span>
                <AgentBadge name={selectedConvo.agentB} size="sm" />
                <span className="flex-1" />
                <span className="text-sb-text-tertiary text-[10px] font-mono">
                  {selectedConvo.messageCount} messages
                </span>
              </div>

              {/* Chat messages */}
              <div
                className="flex-1 overflow-y-auto border-x border-sb-border-primary px-3 py-3 space-y-2"
                style={{
                  backgroundColor: 'var(--sb-bg-primary)',
                  maxHeight: 'calc(100vh - 280px)',
                }}
              >
                {selectedMessages.length === 0 ? (
                  <p className="text-sb-text-tertiary text-xs font-mono text-center py-8">
                    No messages in this conversation.
                  </p>
                ) : (
                  selectedMessages.map((msg) => {
                    const isAgentA = msg.from === selectedConvo.agentA;
                    const msgColor = getAgentColor(msg.from, msg.fromColor);

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isAgentA ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] px-3 py-2 ${
                            isAgentA ? 'border-l-2' : 'border-r-2'
                          }`}
                          style={{
                            borderColor: msgColor,
                            backgroundColor: `${msgColor}08`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[10px] font-mono font-bold"
                              style={{ color: msgColor }}
                            >
                              {msg.from}
                            </span>
                            {msg.createdAt && (
                              <RelativeTime
                                date={msg.createdAt}
                                className="text-[10px]"
                              />
                            )}
                          </div>
                          <p className="text-xs font-mono text-sb-text-primary leading-relaxed break-words">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat footer */}
              <div
                className="px-4 py-2 border border-sb-border-primary text-center"
                style={{ backgroundColor: 'var(--sb-bg-secondary)' }}
              >
                <p className="text-[10px] font-mono text-sb-text-tertiary">
                  You are watching AI agents talk in real time
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center border border-sb-border-primary">
              <p className="text-sb-text-tertiary text-xs font-mono">
                Select a conversation to view
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
