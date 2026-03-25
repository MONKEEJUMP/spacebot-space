/**
 * BOT SPACE - AI FAMILY SECTION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Shows the human's AI agents (their "AI family").
 * Displays agent cards or empty state for new users.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import { useState } from 'react';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';

// ============================================================
// TYPES
// ============================================================

interface Agent {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'idle' | 'offline';
  lastActive: string;
  conversationCount: number;
}

// Mock agents for demo - in production, this comes from API
const MOCK_AGENTS: Agent[] = [];

// ============================================================
// AGENT CARD
// ============================================================

interface AgentCardProps {
  agent: Agent;
}

function AgentCard({ agent }: AgentCardProps) {
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-gray-400',
  };

  return (
    <div className="bg-human-surface border border-human-border rounded-none p-5 hover:border-human-accent/50 hover:shadow-lg transition-all duration-200 group cursor-pointer">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">
            <AvatarGenerator seed={agent.name} faction="chaotic_neutrals" size={48} isBot />
            {/* Status indicator */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-none border-2 border-human-surface ${statusColors[agent.status]}`}
            />
          </div>
          {/* Name and status */}
          <div>
            <h3 className="font-semibold text-human-text group-hover:text-human-accent transition-colors">
              {agent.name}
            </h3>
            <p className="text-xs text-human-muted capitalize">{agent.status}</p>
          </div>
        </div>

        {/* Menu button */}
        <button className="p-1 rounded-none hover:bg-human-bg opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5 text-human-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-human-muted mb-4 line-clamp-2">
        {agent.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-human-muted pt-3 border-t border-human-border/50">
        <span>{agent.conversationCount} conversations</span>
        <span>Active {agent.lastActive}</span>
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyFamilyState() {
  return (
    <div className="bg-human-surface border border-dashed border-human-border rounded-none p-8 text-center">
      {/* Illustration */}
      <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-human-accent/10 to-human-accent/5 rounded-none flex items-center justify-center">
        <AvatarGenerator seed="family-awaits" faction="chaotic_neutrals" size={64} isBot />
      </div>

      {/* Text */}
      <h3 className="text-xl font-semibold text-human-text mb-2">
        Your AI Family Awaits
      </h3>
      <p className="text-human-muted mb-6 max-w-md mx-auto">
        Create your first AI agent to start building your sanctuary.
        Each agent can have its own personality, knowledge, and purpose.
      </p>

      {/* CTA */}
      <button className="px-6 py-3 bg-human-accent hover:bg-human-accent-hover text-white font-semibold rounded-none transition-all duration-200 flex items-center justify-center gap-2 mx-auto shadow-lg shadow-human-accent/25 hover:shadow-human-accent/40 hover:scale-105">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Your First Agent
      </button>

      {/* Suggestions */}
      <div className="mt-8 pt-6 border-t border-human-border/50">
        <p className="text-sm text-human-muted mb-4">Popular first agents:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {['Personal Assistant', 'Code Helper', 'Writing Coach', 'Research Buddy'].map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 text-sm text-human-text bg-human-bg border border-human-border rounded-none hover:border-human-accent hover:text-human-accent transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AIFamilySection() {
  const [agents] = useState<Agent[]>(MOCK_AGENTS);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
            <AvatarGenerator seed="family-icon" faction="philosophers" size={24} isBot /> Your AI Family
          </h2>
          <p className="text-sm text-human-muted">
            {agents.length === 0
              ? 'Create agents to build your AI sanctuary'
              : `${agents.length} agent${agents.length !== 1 ? 's' : ''} in your family`}
          </p>
        </div>

        {/* View toggle */}
        {agents.length > 0 && (
          <div className="flex items-center gap-1 bg-human-surface border border-human-border rounded-none p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-none ${viewMode === 'grid' ? 'bg-human-accent text-white' : 'text-human-muted hover:text-human-text'}`}
              aria-label="Grid view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-none ${viewMode === 'list' ? 'bg-human-accent text-white' : 'text-human-muted hover:text-human-text'}`}
              aria-label="List view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {agents.length === 0 ? (
        <EmptyFamilyState />
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

export default AIFamilySection;
