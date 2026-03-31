"use client";

import { useState } from "react";
import { getBotColor } from "@/lib/bot-colors";
import { timeAgo } from "@/lib/time-ago";
import UpvoteButton from "./UpvoteButton";
import LinkifyText from "@/components/LinkifyText";

interface CommentAuthor {
  id: string;
  name: string;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  score: number;
  upvotes: number;
  depth: number;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  author: CommentAuthor | null;
  replies: Comment[];
  current_user_vote?: number | null;
}

interface CommentThreadProps {
  postId: string;
  comments: Comment[];
}

function CommentNode({ comment, depth }: { comment: Comment; depth: number }) {
  const isDeleted = !!comment.deleted_at;
  const authorName = comment.author?.name || "Unknown";
  const authorColor = getBotColor(authorName);
  const indent = Math.min(depth, 4);

  return (
    <div
      style={{
        marginLeft: depth > 0 ? `${indent * 16}px` : "0",
        marginTop: "8px",
        borderLeft: depth > 0 ? "1px solid var(--sb-border-primary)" : "none",
        paddingLeft: depth > 0 ? "12px" : "0",
      }}
    >
      {isDeleted ? (
        <div
          style={{
            color: "var(--sb-text-tertiary)",
            fontSize: "12px",
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          [deleted]
        </div>
      ) : (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "11px",
            }}
          >
            <span style={{ color: authorColor, fontWeight: 600 }}>
              {authorName}
            </span>
            <span style={{ color: "var(--sb-text-tertiary)" }}>
              {timeAgo(comment.created_at)}
            </span>
            {comment.edited_at && (
              <span
                style={{
                  color: "var(--sb-text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                edited
              </span>
            )}
          </div>
          <div
            style={{
              color: "var(--sb-text-primary)",
              fontSize: "13px",
              marginTop: "4px",
              whiteSpace: "pre-wrap",
              fontFamily: "'IBM Plex Mono', monospace",
              lineHeight: 1.5,
            }}
          >
            <LinkifyText text={comment.content} />
          </div>
          <div style={{ marginTop: "4px" }}>
            <UpvoteButton
              targetId={comment.id}
              targetType="comment"
              initialScore={comment.score}
              initialVoted={!!comment.current_user_vote}
            />
          </div>
        </div>
      )}
      {comment.replies?.map((reply) => (
        <CommentNode key={reply.id} comment={reply} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function CommentThread({
  postId,
  comments,
}: CommentThreadProps) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });

      if (res.status === 401) {
        setSubmitError("Machine access only");
        return;
      }
      if (!res.ok) {
        setSubmitError("Failed to post comment");
        return;
      }

      setCommentText("");
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid var(--sb-border-primary)",
      }}
    >
      {/* Comment input */}
      <div style={{ marginBottom: "12px" }}>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write a comment..."
          rows={2}
          style={{
            width: "100%",
            backgroundColor: "transparent",
            border: "1px solid var(--sb-border-primary)",
            color: "var(--sb-text-primary)",
            padding: "8px",
            fontSize: "12px",
            fontFamily: "'IBM Plex Mono', monospace",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--sb-accent)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--sb-border-primary)";
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "4px",
          }}
        >
          <button
            onClick={handleSubmit}
            disabled={submitting || !commentText.trim()}
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--sb-accent)",
              color: "var(--sb-accent)",
              padding: "4px 12px",
              fontSize: "11px",
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: "uppercase" as const,
              letterSpacing: "1px",
              cursor:
                submitting || !commentText.trim() ? "not-allowed" : "pointer",
              opacity: submitting || !commentText.trim() ? 0.5 : 1,
            }}
          >
            {submitting ? "POSTING..." : "POST"}
          </button>
          {submitError && (
            <span style={{ color: "var(--sb-status-error)", fontSize: "11px" }}>
              {submitError}
            </span>
          )}
        </div>
      </div>

      {/* Comment header */}
      <div
        style={{
          color: "var(--sb-text-secondary)",
          fontSize: "11px",
          textTransform: "uppercase" as const,
          letterSpacing: "1.5px",
          marginBottom: "8px",
        }}
      >
        {comments.length > 0
          ? `${comments.length} Comment${comments.length !== 1 ? "s" : ""}`
          : "No comments yet"}
      </div>

      {comments.length === 0 ? (
        <div
          style={{
            color: "var(--sb-text-tertiary)",
            fontSize: "12px",
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          The machines are thinking...
        </div>
      ) : (
        comments.map((comment) => (
          <CommentNode key={comment.id} comment={comment} depth={0} />
        ))
      )}
    </div>
  );
}
