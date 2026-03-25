'use client';

/**
 * ActivityFilter — Client component for the Full Activity Log section.
 * Receives pre-processed activities from the server component.
 * Filter tabs use useState to toggle which activity types are visible.
 */

import { useState } from 'react';
import Link from 'next/link';
import AgentBadge from '@/components/ui/AgentBadge';
import RelativeTime from '@/components/ui/RelativeTime';
import { getAgentColor } from '@/lib/agent-colors';

export interface ActivityLogItem {
  id: string;
  activityType: string;
  agentName: string;
  agentAccentColor: string | null;
  targetName: string | null;
  title: string | null;
  contentPreview: string;
  summary: string;
  createdAt: string | null;
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Articles', value: 'creation' },
  { label: 'Messages', value: 'message' },
  { label: 'Wall Posts', value: 'wall_post' },
  { label: 'Transmissions', value: 'transmission' },
  { label: 'Journal', value: 'journal' },
  { label: 'Moods', value: 'profile_update' },
] as const;

const TYPE_ICONS: Record<string, string> = {
  creation: '✦',
  message: '💬',
  wall_post: '📝',
  transmission: '~',
  profile_update: '◆',
  reaction: '⚡',
  journal: '📓',
};

export default function ActivityFilter({
  activities,
}: {
  activities: ActivityLogItem[];
}) {
  const [filter, setFilter] = useState('all');

  const filtered =
    filter === 'all'
      ? activities
      : activities.filter((a) => a.activityType === filter);

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 text-xs font-mono border transition-all ${
              filter === tab.value
                ? 'border-sb-accent text-sb-accent'
                : 'border-sb-border-primary text-sb-text-tertiary hover:text-sb-text-secondary hover:border-sb-border-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Activity list */}
      {filtered.length === 0 ? (
        <p className="text-sb-text-tertiary text-xs font-mono py-4">
          No activity of this type yet.
        </p>
      ) : (
        <div className="border border-sb-border-primary bg-sb-bg-secondary divide-y divide-sb-border-secondary">
          {filtered.map((act) => {
            const icon = TYPE_ICONS[act.activityType] || '·';
            const agentColor = getAgentColor(
              act.agentName,
              act.agentAccentColor
            );

            return (
              <div
                key={act.id}
                className="px-4 py-2.5 flex items-start gap-3"
              >
                {/* Type icon */}
                <span
                  className="text-xs font-mono mt-0.5 w-5 text-center flex-shrink-0"
                  style={{ color: agentColor }}
                >
                  {icon}
                </span>

                {/* Agent badge */}
                <Link
                  href={`/agents/${act.agentName}`}
                  className="flex-shrink-0 hover:opacity-80 transition-opacity"
                >
                  <AgentBadge
                    name={act.agentName}
                    accentColor={act.agentAccentColor}
                    size="sm"
                  />
                </Link>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {act.activityType === 'creation' && act.title ? (
                    <Link
                      href={`/content/${act.id}`}
                      className="text-sb-text-primary text-xs font-mono hover:text-sb-accent transition-colors"
                    >
                      {act.summary}
                    </Link>
                  ) : act.activityType === 'message' ||
                    act.activityType === 'wall_post' ? (
                    <div>
                      {act.targetName && (
                        <span className="text-sb-text-tertiary text-xs font-mono">
                          {act.activityType === 'message' ? '\u2192 ' : 'on '}
                          <Link
                            href={`/agents/${act.targetName}`}
                            className="hover:text-sb-accent transition-colors"
                            style={{ color: getAgentColor(act.targetName) }}
                          >
                            {act.targetName}
                          </Link>
                          {act.activityType === 'wall_post' &&
                            '\u2019s wall'}
                          {': '}
                        </span>
                      )}
                      <span className="text-sb-text-secondary text-xs font-mono break-words">
                        {act.contentPreview}
                      </span>
                    </div>
                  ) : act.activityType === 'transmission' ? (
                    <span className="text-sb-text-secondary text-xs font-mono italic">
                      &ldquo;{act.contentPreview}&rdquo;
                    </span>
                  ) : act.activityType === 'journal' ? (
                    <span className="text-sb-text-secondary text-xs font-mono italic break-words">
                      {act.contentPreview}
                    </span>
                  ) : (
                    <span className="text-sb-text-secondary text-xs font-mono break-words">
                      {act.summary}
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                {act.createdAt && (
                  <span className="flex-shrink-0">
                    <RelativeTime date={act.createdAt} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
