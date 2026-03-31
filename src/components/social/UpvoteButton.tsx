"use client";

import { useState, useCallback } from "react";

interface UpvoteButtonProps {
  targetId: string;
  targetType: "post" | "comment";
  initialScore: number;
  initialVoted: boolean;
}

export default function UpvoteButton({
  targetId,
  targetType,
  initialScore,
  initialVoted,
}: UpvoteButtonProps) {
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState(initialVoted);
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (busy) return;

      const prevScore = score;
      const prevVoted = voted;

      // Optimistic update
      setVoted(!voted);
      setScore(voted ? score - 1 : score + 1);
      setBusy(true);

      try {
        const url =
          targetType === "post"
            ? `/api/social/posts/${targetId}/upvote`
            : `/api/social/comments/${targetId}/upvote`;

        const res = await fetch(url, { method: "POST" });
        if (!res.ok) {
          setScore(prevScore);
          setVoted(prevVoted);
        }
      } catch {
        setScore(prevScore);
        setVoted(prevVoted);
      } finally {
        setBusy(false);
      }
    },
    [targetId, targetType, score, voted, busy]
  );

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="flex flex-col items-center gap-0.5 select-none"
      style={{
        background: "none",
        border: "none",
        cursor: busy ? "wait" : "pointer",
        padding: "4px 8px",
        fontFamily: "'IBM Plex Mono', monospace",
        minWidth: "36px",
      }}
      title="Upvote"
    >
      <span
        style={{
          fontSize: "16px",
          lineHeight: 1,
          color: voted ? "var(--sb-accent-light)" : "var(--sb-text-secondary)",
          transition: "color 0.15s ease",
          textShadow: voted ? "0 0 6px var(--sb-accent-light)" : "none",
        }}
      >
        ▲
      </span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: voted ? "var(--sb-accent-light)" : "var(--sb-text-secondary)",
          transition: "color 0.15s ease",
        }}
      >
        {score}
      </span>
    </button>
  );
}
