'use client';

import NewsCard from './NewsCard';

interface MosaicPost {
  id: string;
  title: string;
  source: string;
  articleUrl: string;
  category: string;
  createdAt: string;
  size: 'big' | 'medium' | 'small';
  editorialNote?: string | null;
  thumbnailUrl?: string | null;
}

interface NewsMosaicProps {
  posts: MosaicPost[];
}

export default function NewsMosaic({ posts }: NewsMosaicProps) {
  if (posts.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '100px 20px',
        color: '#65676B',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '16px',
      }}>
        NewsSpace is warming up. The AI editor is reviewing stories. Check back in a few minutes.
      </div>
    );
  }

  // Build layout rows driven by QWEN tile_size — not by position
  const rows: React.ReactNode[] = [];
  let mediumBuffer: MosaicPost[] = [];
  let smallBuffer: MosaicPost[] = [];

  function flushMedium() {
    if (mediumBuffer.length === 0) return;
    const buf = [...mediumBuffer];
    mediumBuffer = [];
    rows.push(
      <div
        key={`medium-${rows.length}`}
        className={buf.length >= 2 ? 'mosaic-row-medium' : 'mosaic-row-big'}
        style={{ marginBottom: '16px' }}
      >
        {buf.map((p) => (
          <NewsCard key={p.id} {...p} />
        ))}
      </div>
    );
  }

  function flushSmall() {
    if (smallBuffer.length === 0) return;
    const buf = [...smallBuffer];
    smallBuffer = [];
    rows.push(
      <div
        key={`small-${rows.length}`}
        className="mosaic-row-small"
        style={{ marginBottom: '16px' }}
      >
        {buf.map((p) => (
          <NewsCard key={p.id} {...p} />
        ))}
      </div>
    );
  }

  for (const post of posts) {
    if (post.size === 'big') {
      flushMedium();
      flushSmall();
      rows.push(
        <div key={`big-${post.id}`} className="mosaic-row-big" style={{ marginBottom: '16px' }}>
          <NewsCard {...post} />
        </div>
      );
    } else if (post.size === 'medium') {
      flushSmall();
      mediumBuffer.push(post);
      if (mediumBuffer.length >= 2) flushMedium();
    } else {
      flushMedium();
      smallBuffer.push(post);
      if (smallBuffer.length >= 3) flushSmall();
    }
  }
  flushMedium();
  flushSmall();

  return (
    <>
      <style>{`
        .newsspace-mosaic {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          padding: 16px;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .mosaic-row-big {
          display: grid;
          grid-template-columns: 1fr;
        }
        .mosaic-row-medium {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .mosaic-row-small {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .news-card {
          transition: box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .news-card:hover {
          background-color: #EBF5FF !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
        }
        @media (max-width: 767px) {
          .mosaic-row-medium,
          .mosaic-row-small {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="newsspace-mosaic">
        {rows}
      </div>
    </>
  );
}
