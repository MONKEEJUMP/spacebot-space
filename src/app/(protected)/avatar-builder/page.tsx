'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const AvatarGenerator = dynamic(() => import('@/components/avatar/AvatarGenerator'), {
  ssr: false,
  loading: () => <div className="h-[200px] w-[200px] animate-pulse rounded-full bg-muted" />,
});

const AvatarPopup = dynamic(() => import('@/components/avatar/AvatarPopup'), {
  ssr: false,
});

interface SavedAvatar {
  id: string;
  seed: string;
  isBot: boolean;
  createdAt: string;
}

export default function AvatarBuilderPage() {
  const [seed, setSeed] = useState('');
  const [gallery, setGallery] = useState<SavedAvatar[]>([]);
  const [popup, setPopup] = useState<{ seed: string; isBot: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const regenerate = useCallback(() => {
    setSeed(Math.random().toString(36).substring(2, 10));
  }, []);

  const fetchGallery = useCallback(async () => {
    try {
      const res = await fetch('/api/avatar/gallery');
      if (res.ok) {
        const data = await res.json();
        setGallery(data);
      }
    } catch (e) {
      console.error('Failed to fetch gallery:', e);
    }
  }, []);

  const saveToGallery = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/avatar/save-to-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, isBot: false }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Saved!');
        fetchGallery();
      } else {
        setMessage(data.error || 'Failed to save');
      }
    } catch (e) {
      setMessage('Error saving avatar');
    } finally {
      setSaving(false);
    }
  }, [seed, saving, fetchGallery]);

  const deleteAvatar = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/avatar/delete-from-gallery', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) fetchGallery();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  }, [fetchGallery]);

  const useAsProfile = useCallback(async (avatarSeed: string, isBot: boolean) => {
    try {
      const res = await fetch('/api/avatar/set-from-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: avatarSeed, isBot }),
      });
      if (res.ok) {
        setMessage('Profile photo updated!');
      }
    } catch (e) {
      console.error('Failed to set profile:', e);
    }
  }, []);

  useEffect(() => {
    regenerate();
    fetchGallery();
  }, [regenerate, fetchGallery]);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="mb-6 text-3xl font-bold">Avatar Builder</h1>

      <div className="mb-8 flex flex-col items-center gap-4 rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">Click avatar to view full size</p>
        <div
          className="cursor-pointer overflow-hidden rounded-full"
          onClick={() => setPopup({ seed, isBot: false })}
        >
          <AvatarGenerator seed={seed} size={200} isBot={false} />
        </div>
        <div className="flex gap-3">
          <button
            onClick={regenerate}
            className="rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Regenerate
          </button>
          <button
            onClick={saveToGallery}
            disabled={saving}
            className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save to Gallery'}
          </button>
        </div>
        {message && (
          <p className="text-sm font-medium text-green-600">{message}</p>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">
          Your Gallery ({gallery.length}/100)
        </h2>
        {gallery.length === 0 ? (
          <p className="text-muted-foreground">
            No saved avatars yet. Generate and save some above!
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
            {gallery.map((avatar) => (
              <div key={avatar.id} className="group relative">
                <div
                  className="cursor-pointer overflow-hidden rounded-lg"
                  onClick={() => setPopup({ seed: avatar.seed, isBot: avatar.isBot })}
                >
                  <AvatarGenerator seed={avatar.seed} size={100} isBot={avatar.isBot} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); useAsProfile(avatar.seed, avatar.isBot); }}
                    className="rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
                    title="Use as profile photo"
                  >
                    Use
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteAvatar(avatar.id); }}
                    className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-600"
                    title="Delete"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {popup && (
        <AvatarPopup
          seed={popup.seed}
          isBot={popup.isBot}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
