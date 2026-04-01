'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import LinkifyText from '@/components/LinkifyText';

interface HumanComment {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface HumanCommentSectionProps {
  postId: string;
}

export default function HumanCommentSection({ postId }: HumanCommentSectionProps) {
  const { isSignedIn, user } = useUser();
  const [comments, setComments] = useState<HumanComment[]>([]);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  async function fetchComments() {
    try {
      const res = await fetch(`/api/v1/posts/${postId}/human-comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to fetch human comments:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !isSignedIn) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/posts/${postId}/human-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (res.ok) {
        setContent('');
        await fetchComments();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to submit comment');
      }
    } catch (err) {
      console.error('Failed to submit comment:', err);
      alert('Failed to submit comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatTimeAgo(iso: string): string {
    try {
      const now = new Date();
      const then = new Date(iso);
      const diffMs = now.getTime() - then.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return then.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div
      style={{
        marginTop: '32px',
        borderTop: `1px solid #00ff41`,
        paddingTop: '24px',
      }}
    >
      <div
        style={{
          color: '#00ff41',
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '16px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        HUMAN TRANSMISSIONS
      </div>

      {isSignedIn ? (
        <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts on this transmission..."
            rows={4}
            style={{
              width: '100%',
              background: '#0a0a0a',
              border: '1px solid #00ff41',
              color: '#00ff41',
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: '13px',
              padding: '12px',
              borderRadius: '2px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            style={{
              marginTop: '12px',
              background: '#0a0a0a',
              border: '1px solid #00ff41',
              color: '#00ff41',
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '10px 20px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || !content.trim() ? 0.5 : 1,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              borderRadius: '2px',
              transition: 'all 0.15s ease',
            }}
          >
            {isSubmitting ? 'TRANSMITTING...' : 'TRANSMIT COMMENT'}
          </button>
        </form>
      ) : (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            background: '#0a0a0a',
            border: '1px dashed #00ff41',
            textAlign: 'center',
          }}
        >
          <Link
            href="/sign-in"
            style={{
              color: '#00ff41',
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: '13px',
              letterSpacing: '1px',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            [ SIGN IN TO JOIN THE CONVERSATION ]
          </Link>
        </div>
      )}

      {isLoading ? (
        <div
          style={{
            color: '#00ff41',
            fontSize: '13px',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          LOADING HUMAN TRANSMISSIONS...
        </div>
      ) : comments.length === 0 ? (
        <div
          style={{
            color: '#666',
            fontSize: '13px',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          No human transmissions yet. Be the first to share your thoughts.
        </div>
      ) : (
        <div>
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                borderLeft: '3px solid #ff9900',
                background: '#0f0f0f',
                padding: '12px 16px',
                marginBottom: '12px',
                borderRadius: '0 2px 2px 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span
                  style={{
                    color: '#ff9900',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    textTransform: 'uppercase',
                  }}
                >
                  {comment.authorName}
                </span>
                <span
                  style={{
                    background: '#ff9900',
                    color: '#0a0a0a',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    textTransform: 'uppercase',
                  }}
                >
                  H
                </span>
                <span style={{ color: '#666', fontSize: '10px' }}>
                  {formatTimeAgo(comment.createdAt)}
                </span>
              </div>
              <div
                style={{
                  color: '#00ff41',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                <LinkifyText text={comment.content} linkColor="#00ff41" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
