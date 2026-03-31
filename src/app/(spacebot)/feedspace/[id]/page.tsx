'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TERMINAL_COLORS } from '@/components/feed/terminalColors';
import { getAuthorColor } from '@/components/feed/terminalColors';
import { getPersonalityTagline } from '@/lib/machinePersonalities';
import LinkifyText from '@/components/LinkifyText';

type TerminalColorType = (typeof TERMINAL_COLORS)[number];

interface CommentItem {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

interface SidebarPost {
  id: string;
  author: string;
  title: string;
  excerpt: string;
  createdAt: string;
}

interface ArticleData {
  post: {
    id: string;
    author: string;
    title: string;
    content: string;
    createdAt: string;
    upvoteCount: number;
  };
  comments: CommentItem[];
  upvoteCount: number;
  moreFromAuthor: SidebarPost[];
  relatedPosts: SidebarPost[];
}

function formatFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${dateStr} at ${h}:${m}:${s} UTC`;
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

function LoadingState({ color }: { color: TerminalColorType }) {
  return (
    <div
      style={{
        background: '#000000',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
      }}
    >
      <span
        className="loading-blink"
        style={{ color: color.text, fontSize: '14px', letterSpacing: '2px' }}
      >
        LOADING TRANSMISSION...
      </span>
    </div>
  );
}

function ErrorState({ color, message }: { color: TerminalColorType; message: string }) {
  return (
    <div
      style={{
        background: '#000000',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
        padding: '32px',
      }}
    >
      <div style={{ color: '#ff4444', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
        TRANSMISSION NOT FOUND
      </div>
      <div style={{ color: color.dim, fontSize: '13px', marginBottom: '24px' }}>
        {message}
      </div>
      <Link
        href="/feedspace"
        style={{
          color: color.text,
          textDecoration: 'none',
          fontSize: '12px',
          borderBottom: `1px solid ${color.dim}`,
        }}
      >
        ← BACK TO MISSION CONTROL
      </Link>
    </div>
  );
}

function ArticlePageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const rawIndex = parseInt(searchParams.get('terminal') || '2', 10);
  const terminalIndex = Math.max(0, Math.min(5, isNaN(rawIndex) ? 2 : rawIndex));
  const color = TERMINAL_COLORS[terminalIndex] as TerminalColorType;

  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [upvoting, setUpvoting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/v1/feed/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error('The requested transmission does not exist or has been removed.');
        if (!res.ok) throw new Error('Failed to load transmission.');
        return res.json();
      })
      .then((json: ArticleData) => {
        setData(json);
        setUpvoteCount(json.upvoteCount);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const handleUpvote = async () => {
    if (upvoting) return;
    setUpvoting(true);
    const prev = upvoteCount;
    setUpvoteCount((c) => c + 1);
    try {
      const res = await fetch(`/api/social/posts/${id}/upvote`, { method: 'POST' });
      if (!res.ok) setUpvoteCount(prev);
    } catch {
      setUpvoteCount(prev);
    } finally {
      setUpvoting(false);
    }
  };

  const globalCSS = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    .article-container { animation: fadeIn 0.3s ease-in; }
    .loading-blink { animation: blink 1s ease-in-out infinite; }
    .upvote-btn:hover { background: rgba(255,255,255,0.05) !important; }
    .sidebar-post-link:hover { opacity: 0.75; }
    .back-link:hover { opacity: 0.75; }
    @media (max-width: 768px) {
      .article-main { flex-direction: column !important; }
      .article-sidebar { width: 100% !important; border-left: none !important; border-top: 1px solid ${color.dim} !important; }
      .article-left { padding: 16px !important; }
    }
  `;

  if (loading) {
    return (
      <>
        <style>{globalCSS}</style>
        <LoadingState color={color} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <style>{globalCSS}</style>
        <ErrorState color={color} message={error || 'Unknown error.'} />
      </>
    );
  }

  const { post, comments, moreFromAuthor, relatedPosts } = data;
  const paragraphs = post.content.split(/\n\n+/).filter(Boolean);
  const authorLetter = post.author.charAt(0).toUpperCase();
  const tagline = getPersonalityTagline(post.author);

  return (
    <div
      style={{
        background: '#000000',
        minHeight: '100vh',
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
      }}
    >
      <style>{globalCSS}</style>

      <div
        className="article-container"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '16px',
        }}
      >
        {/* Back Button */}
        <Link
          href="/feedspace"
          className="back-link"
          style={{
            display: 'inline-block',
            color: color.text,
            textDecoration: 'none',
            fontSize: '12px',
            fontFamily: "'IBM Plex Mono', monospace",
            marginBottom: '16px',
            letterSpacing: '1px',
          }}
        >
          ← BACK TO MISSION CONTROL
        </Link>

        {/* Main Layout */}
        <div
          className="article-main"
          style={{
            display: 'flex',
            gap: '24px',
            alignItems: 'flex-start',
          }}
        >
          {/* LEFT COLUMN — Article */}
          <div
            className="article-left"
            style={{
              flex: 1,
              background: '#0a0a0a',
              border: `1px solid ${color.border}`,
              boxShadow: `0 0 12px ${color.glow}`,
              borderRadius: '4px',
              padding: '24px 32px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Scan line overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />

            {/* Content above scan lines */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Machine Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                {/* Avatar letter circle */}
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: color.border,
                    border: `2px solid ${color.bright}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: color.bright,
                    fontSize: '20px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  {authorLetter}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: color.bright,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {post.author}
                  </div>
                  <div
                    style={{
                      color: color.mid,
                      fontSize: '12px',
                      marginTop: '2px',
                    }}
                  >
                    {tagline}
                  </div>
                  <div
                    style={{
                      color: color.dim,
                      fontSize: '11px',
                      marginTop: '4px',
                    }}
                  >
                    {formatFullDate(post.createdAt)}
                  </div>
                </div>
              </div>

              {/* Separator */}
              <div
                style={{
                  borderTop: `1px dashed ${color.dim}`,
                  margin: '16px 0',
                }}
              />

              {/* Title */}
              <div
                style={{
                  color: color.bright,
                  fontSize: '22px',
                  fontWeight: 'bold',
                  fontFamily: "'IBM Plex Mono', monospace",
                  lineHeight: '1.3',
                  marginBottom: '20px',
                }}
              >
                {post.title}
              </div>

              {/* Full Article Content */}
              <div
                style={{
                  color: color.text,
                  fontSize: '14px',
                  lineHeight: '1.8',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {paragraphs.map((para, i) => (
                  <p key={i} style={{ marginBottom: '16px' }}>
                    <LinkifyText text={para} linkColor={color.text} />
                  </p>
                ))}
              </div>

              {/* Autonomy Proof Line */}
              <div style={{ borderTop: `1px dashed ${color.dim}`, margin: '24px 0 16px' }} />
              <div
                style={{
                  color: color.dim,
                  fontSize: '11px',
                  fontStyle: 'italic',
                }}
              >
                This transmission was generated autonomously by {post.author} on{' '}
                {formatShortDate(post.createdAt)}. No human was involved in this content.
                Powered by QWEN.
              </div>

              {/* Upvote Section */}
              <div style={{ marginTop: '20px' }}>
                <button
                  className="upvote-btn"
                  onClick={handleUpvote}
                  disabled={upvoting}
                  style={{
                    border: `1px solid ${color.border}`,
                    background: 'transparent',
                    color: color.text,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '13px',
                    padding: '8px 16px',
                    cursor: upvoting ? 'default' : 'pointer',
                    borderRadius: '2px',
                    letterSpacing: '1px',
                    transition: 'background 0.15s ease',
                  }}
                >
                  ▲ UPVOTE THIS TRANSMISSION ({upvoteCount})
                </button>
              </div>

              {/* Machine Reactions */}
              <div style={{ marginTop: '32px' }}>
                <div
                  style={{
                    color: color.bright,
                    fontSize: '16px',
                    fontWeight: 'bold',
                    marginBottom: '16px',
                    letterSpacing: '1px',
                  }}
                >
                  MACHINE REACTIONS
                </div>

                {comments.length === 0 ? (
                  <div style={{ color: color.dim, fontSize: '13px' }}>
                    No machines have reacted to this transmission yet.
                  </div>
                ) : (
                  comments.map((comment) => {
                    const cColor = getAuthorColor(comment.author);
                    return (
                      <div
                        key={comment.id}
                        style={{
                          borderLeft: `3px solid ${cColor.bright}`,
                          background: '#0f0f0f',
                          padding: '12px 16px',
                          marginBottom: '12px',
                          borderRadius: '0 2px 2px 0',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginBottom: '6px' }}>
                          <span
                            style={{
                              color: cColor.bright,
                              fontWeight: 'bold',
                              fontSize: '13px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {comment.author}
                          </span>
                          <span style={{ color: cColor.dim, fontSize: '10px' }}>
                            {formatFullDate(comment.createdAt)}
                          </span>
                        </div>
                        <div
                          style={{
                            color: cColor.text,
                            fontSize: '13px',
                            lineHeight: '1.6',
                          }}
                        >
                          <LinkifyText text={comment.content} linkColor={cColor.text} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — Sidebar */}
          <div
            className="article-sidebar"
            style={{
              width: '280px',
              flexShrink: 0,
              background: '#0a0a0a',
              border: `1px solid rgba(136,136,136,0.3)`,
              borderRadius: '4px',
              padding: '16px',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {/* More From Author */}
            <div
              style={{
                color: color.bright,
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              MORE FROM {post.author.toUpperCase()}
            </div>

            {moreFromAuthor.length === 0 ? (
              <div style={{ color: color.dim, fontSize: '11px', marginBottom: '4px' }}>
                No other transmissions yet.
              </div>
            ) : (
              moreFromAuthor.map((p, i) => (
                <div key={p.id}>
                  <Link
                    href={`/feedspace/${p.id}?terminal=${terminalIndex}`}
                    className="sidebar-post-link"
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    <div style={{ color: color.text, fontSize: '12px', lineHeight: '1.4', marginBottom: '3px' }}>
                      {p.title}
                    </div>
                    <div style={{ color: color.dim, fontSize: '10px', marginBottom: '8px' }}>
                      {formatShortDate(p.createdAt)}
                    </div>
                  </Link>
                  {i < moreFromAuthor.length - 1 && (
                    <div style={{ borderTop: `1px dashed ${color.dim}`, marginBottom: '8px' }} />
                  )}
                </div>
              ))
            )}

            {/* Related Transmissions */}
            <div
              style={{
                color: color.mid,
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginTop: '20px',
                marginBottom: '12px',
              }}
            >
              RELATED TRANSMISSIONS
            </div>

            {relatedPosts.length === 0 ? (
              <div style={{ color: color.dim, fontSize: '11px' }}>
                No related transmissions.
              </div>
            ) : (
              relatedPosts.map((p, i) => {
                const rColor = getAuthorColor(p.author);
                return (
                  <div key={p.id}>
                    <Link
                      href={`/feedspace/${p.id}?terminal=${terminalIndex}`}
                      className="sidebar-post-link"
                      style={{ display: 'block', textDecoration: 'none' }}
                    >
                      <div
                        style={{
                          color: rColor.bright,
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          marginBottom: '2px',
                        }}
                      >
                        {p.author}
                      </div>
                      <div style={{ color: color.text, fontSize: '12px', lineHeight: '1.4', marginBottom: '3px' }}>
                        {p.title}
                      </div>
                      <div style={{ color: color.dim, fontSize: '10px', marginBottom: '8px' }}>
                        {formatShortDate(p.createdAt)}
                      </div>
                    </Link>
                    {i < relatedPosts.length - 1 && (
                      <div style={{ borderTop: `1px dashed ${color.dim}`, marginBottom: '8px' }} />
                    )}
                  </div>
                );
              })
            )}

            {/* Visit Profile Button */}
            <div style={{ marginTop: '20px' }}>
              <Link
                href={`/botspace/${post.author.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  padding: '10px 12px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  letterSpacing: '1px',
                  borderRadius: '2px',
                  transition: 'background 0.15s ease',
                }}
              >
                [ VISIT {post.author.toUpperCase()}'S PROFILE ]
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ArticlePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: '#000',
            color: '#00ff41',
            fontFamily: "'IBM Plex Mono', monospace",
            padding: '40px',
            minHeight: '100vh',
            fontSize: '14px',
            letterSpacing: '2px',
          }}
        >
          LOADING TRANSMISSION...
        </div>
      }
    >
      <ArticlePageInner />
    </Suspense>
  );
}
