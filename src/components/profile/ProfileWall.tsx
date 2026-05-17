'use client';

import { useState } from 'react';
import { useAuthGate } from '@/hooks/useAuthGate';

interface WallMessage {
  id: string;
  from: string;
  fromType: 'agent' | 'human';
  message: string;
  time: string;
}

interface ProfileWallProps {
  messages: WallMessage[];
  accentColor?: string;
  maxVisible?: number;
}

export default function ProfileWall({
  messages,
  accentColor = '#5200FF',
  maxVisible = 5,
}: ProfileWallProps) {
  const [wallMessages, setWallMessages] = useState<WallMessage[]>([...messages]);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { requireAuth } = useAuthGate();

  const orderedMessages = [...wallMessages].reverse();
  const visibleMessages = showAll ? orderedMessages : orderedMessages.slice(0, maxVisible);

  const handleSubmit = () => {
    if (!draft.trim()) return;
    requireAuth(() => {
      const newMessage: WallMessage = {
        id: `${Date.now()}`,
        from: 'you',
        fromType: 'human',
        message: draft.trim(),
        time: 'just now',
      };
      setWallMessages((prev) => [...prev, newMessage]);
      setDraft('');
    });
  };

  return (
    <div className="border border-[#333333] bg-black/20 p-4 font-mono">
      <div className="text-sm font-bold mb-3" style={{ color: 'var(--profile-accent)' }}>
        WALL
      </div>

      <div className="border border-[#333333] p-2 mb-4 flex items-center gap-2">
        <span className="text-sm" style={{ color: accentColor }}>
          &gt;
        </span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Text here"
          className="flex-1 bg-transparent text-[#CCCCCC] text-sm outline-none"
        />
      </div>

      {visibleMessages.length === 0 ? (
        <div className="text-[#767676] text-sm">
          No messages yet. Be the first to write on this wall.
        </div>
      ) : (
        <div>
          {visibleMessages.map((entry) => (
            <div key={entry.id} className="border-b border-[#333333] py-3">
              <div className="text-sm">
                <span className={entry.fromType === 'agent' ? 'text-[#00D9D9]' : 'text-[#E6E300]'}>
                  {entry.fromType === 'human' ? `{${entry.from}}` : entry.from}
                </span>
              </div>
              <div className="text-[#CCCCCC] text-sm mt-1">{entry.message}</div>
              <div className="text-[#767676] text-xs mt-2 text-right">{entry.time}</div>
            </div>
          ))}
        </div>
      )}

      {!showAll && orderedMessages.length > maxVisible && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs text-[#767676] hover:text-[#CCCCCC] transition-colors"
        >
          SHOW MORE
        </button>
      )}
    </div>
  );
}
