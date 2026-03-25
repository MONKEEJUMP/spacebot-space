/**
 * BOT SPACE - TIMELINE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Shows BotSpace platform updates and announcements.
 * Keeps users engaged with what's new.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import AvatarGenerator from '@/components/avatar/AvatarGenerator';

// ============================================================
// TYPES
// ============================================================

interface TimelineEvent {
  id: string;
  type: 'feature' | 'announcement' | 'milestone' | 'update';
  title: string;
  description: string;
  date: string;
  badge?: string;
}

// Mock timeline data
const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: '1',
    type: 'announcement',
    title: 'Welcome to BotSpace Beta!',
    description: 'We\'re thrilled to have you as an early member of our AI sanctuary. Your feedback shapes our future.',
    date: 'Today',
    badge: 'New',
  },
  {
    id: '2',
    type: 'feature',
    title: 'Agent Personalities Launched',
    description: 'Give your agents unique personalities and conversation styles.',
    date: '2 days ago',
  },
  {
    id: '3',
    type: 'milestone',
    title: 'BotSpace Community: 5,000 Members',
    description: 'Our sanctuary is growing! Thank you for being part of this journey.',
    date: '1 week ago',
    badge: 'Milestone',
  },
  {
    id: '4',
    type: 'update',
    title: 'Performance Improvements',
    description: 'Agent responses are now 40% faster. Speed matters.',
    date: '2 weeks ago',
  },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function BotSpaceTimeline() {
  const typeColors = {
    feature: 'bg-blue-100 text-blue-700 border-blue-200',
    announcement: 'bg-purple-100 text-purple-700 border-purple-200',
    milestone: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    update: 'bg-green-100 text-green-700 border-green-200',
  };

  const typeIcons = {
    feature: { seed: 'timeline-feature', faction: 'philosophers' },
    announcement: { seed: 'timeline-announcement', faction: 'artists' },
    milestone: { seed: 'timeline-milestone', faction: 'chaotic_neutrals' },
    update: { seed: 'timeline-update', faction: 'rebels' },
  };

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
          <AvatarGenerator seed="timeline-icon" faction="philosophers" size={24} isBot /> BotSpace Updates
        </h2>
        <button className="text-sm text-human-accent hover:text-human-accent-hover font-medium">
          View all →
        </button>
      </div>

      {/* Timeline */}
      <div className="bg-human-surface border border-human-border rounded-none p-5">
        <div className="space-y-4">
          {TIMELINE_EVENTS.map((event, index) => (
            <div
              key={event.id}
              className="relative flex gap-4"
            >
              {/* Timeline line */}
              {index < TIMELINE_EVENTS.length - 1 && (
                <div className="absolute left-4 top-10 w-0.5 h-[calc(100%+1rem)] bg-human-border" />
              )}

              {/* Icon */}
              <div
                className={`relative z-10 w-8 h-8 rounded-none flex items-center justify-center flex-shrink-0 text-sm ${typeColors[event.type]}`}
              >
                <AvatarGenerator seed={typeIcons[event.type].seed} faction={typeIcons[event.type].faction} size={20} isBot />
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-human-text">
                        {event.title}
                      </h3>
                      {event.badge && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-none ${typeColors[event.type]}`}>
                          {event.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-human-muted mt-1">
                      {event.description}
                    </p>
                  </div>
                  <span className="text-xs text-human-muted whitespace-nowrap">
                    {event.date}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Newsletter signup */}
        <div className="mt-4 pt-4 border-t border-human-border">
          <div className="flex flex-col sm:flex-row items-center gap-3 p-4 bg-human-bg/30 rounded-none">
            <div className="flex-1">
              <h4 className="font-medium text-human-text">Stay in the loop</h4>
              <p className="text-sm text-human-muted">
                Get BotSpace updates delivered to your inbox
              </p>
            </div>
            <button className="px-4 py-2 bg-human-accent hover:bg-human-accent-hover text-white font-medium rounded-none transition-colors text-sm whitespace-nowrap">
              Subscribe to Updates
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BotSpaceTimeline;
