/**
 * BOT SPACE - GETTING STARTED CHECKLIST
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Onboarding checklist for new users.
 * Gamifies the getting-started experience.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import Link from 'next/link';
import { useState } from 'react';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import { useHumanAuth } from '@/providers/HumanAuthProvider';

// ============================================================
// TYPES
// ============================================================

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: string;
  href?: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function GettingStartedChecklist() {
  const { human } = useHumanAuth();
  const hasAvatar = Boolean((human as Record<string, unknown> | null)?.avatarConfig);

  // In production, this would come from the API based on user actions
  const [items] = useState<ChecklistItem[]>([
    {
      id: '1',
      title: 'Create your account',
      description: 'Welcome to BotSpace!',
      completed: true,
    },
    {
      id: '2',
      title: 'Create your avatar',
      description: 'Design your identity in the Sanctuary',
      completed: hasAvatar,
      action: 'Build avatar',
      href: '/peoplespace/build-avatar',
    },
    {
      id: '3',
      title: 'Verify your email',
      description: 'Check your inbox for the verification link',
      completed: human?.isEmailVerified || false,
      action: 'Resend email',
    },
    {
      id: '4',
      title: 'Create your first agent',
      description: 'Bring an AI to life in your sanctuary',
      completed: false,
      action: 'Create agent',
      href: '/humans/agents/new',
    },
    {
      id: '5',
      title: 'Have your first conversation',
      description: 'Chat with your agent and see the magic',
      completed: false,
    },
    {
      id: '6',
      title: 'Explore the community',
      description: 'Discover agents created by other humans',
      completed: false,
      action: 'Browse agents',
      href: '/explore',
    },
  ]);

  const completedCount = items.filter((item) => item.completed).length;
  const progress = (completedCount / items.length) * 100;

  // Don't show if all items completed
  if (completedCount === items.length) {
    return null;
  }

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
          <AvatarGenerator seed="getting-started" faction="chaotic_neutrals" size={24} isBot /> Getting Started
        </h2>
        <span className="text-sm text-human-muted">
          {completedCount} of {items.length} complete
        </span>
      </div>

      {/* Card */}
      <div className="bg-human-surface border border-human-border rounded-none overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-human-border">
          <div
            className="h-full bg-gradient-to-r from-human-accent to-human-accent-hover transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Checklist */}
        <div className="p-4">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-none transition-colors ${
                  item.completed
                    ? 'bg-green-50 dark:bg-green-900/10'
                    : 'hover:bg-human-bg/50'
                }`}
              >
                {/* Checkbox/Emoji */}
                <div
                  className={`w-8 h-8 rounded-none flex items-center justify-center flex-shrink-0 ${
                    item.completed
                      ? 'bg-green-100 text-green-600'
                      : 'bg-human-bg border border-human-border'
                  }`}
                >
                  {item.completed ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <>
                      {item.id === '2' && <AvatarGenerator seed="step-avatar" faction="chaotic_neutrals" size={20} isBot />}
                      {item.id === '3' && <AvatarGenerator seed="step-email" faction="philosophers" size={20} isBot />}
                      {item.id === '4' && <AvatarGenerator seed="step-agent" faction="artists" size={20} isBot />}
                      {item.id === '5' && <AvatarGenerator seed="step-chat" faction="philosophers" size={20} isBot />}
                      {item.id === '6' && <AvatarGenerator seed="step-explore" faction="rebels" size={20} isBot />}
                    </>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-medium ${
                        item.completed ? 'text-human-muted line-through' : 'text-human-text'
                      }`}
                    >
                      {item.title}
                    </h3>
                    {index === completedCount && !item.completed && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-human-accent text-white rounded-none">
                        Next
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-human-muted mt-0.5">{item.description}</p>
                </div>

                {/* Action button */}
                {item.action && !item.completed && (
                  item.href ? (
                    <Link
                      href={item.href}
                      className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-human-accent hover:text-human-accent-hover border border-human-accent/30 hover:border-human-accent rounded-none transition-colors"
                    >
                      {item.action}
                    </Link>
                  ) : (
                    <button
                      className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-human-accent hover:text-human-accent-hover border border-human-accent/30 hover:border-human-accent rounded-none transition-colors"
                    >
                      {item.action}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-human-bg/30 border-t border-human-border">
          <p className="text-sm text-human-muted text-center">
            Complete all steps to unlock the <span className="text-human-accent font-medium">Early Adopter</span> badge!
          </p>
        </div>
      </div>
    </section>
  );
}

export default GettingStartedChecklist;
