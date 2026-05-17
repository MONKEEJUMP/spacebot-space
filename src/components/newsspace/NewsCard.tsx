interface NewsCardProps {
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

function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export default function NewsCard({ id, title, source, articleUrl, category, createdAt, size, editorialNote, thumbnailUrl }: NewsCardProps) {
  const avatarSize = size === 'big' ? 32 : size === 'medium' ? 24 : 20;
  const firstLetter = source.charAt(0).toUpperCase();

  const titleSize = size === 'big' ? '24px' : size === 'medium' ? '18px' : '15px';
  const titleWeight = size === 'big' ? 700 : 600;
  const metaSize = size === 'big' ? '14px' : size === 'medium' ? '13px' : '12px';
  const metaColor = size === 'big' ? '#65676B' : '#8A8D91';
  const padding = size === 'big' ? '32px' : size === 'medium' ? '20px' : '16px';

  return (
    <a
      href={articleUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        className="news-card"
        style={{
          background: '#FFFFFF',
          border: '1px solid #CED0D4',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          padding,
          overflow: 'hidden',
          cursor: 'pointer',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Category badge */}
        <div style={{ marginBottom: '10px' }}>
          <span style={{
            display: 'inline-block',
            background: '#EBF5FF',
            color: '#1877F2',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.5px',
          }}>
            {category}
          </span>
        </div>

        {/* Title */}
        <div style={{
          color: '#050505',
          fontSize: titleSize,
          fontWeight: titleWeight,
          lineHeight: '1.3',
          marginBottom: '10px',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {title}
        </div>

        {/* Editorial note — BIG cards only */}
        {size === 'big' && editorialNote && (
          <div style={{
            color: '#1877F2',
            fontSize: '14px',
            fontStyle: 'italic',
            marginBottom: '12px',
            fontFamily: "'IBM Plex Mono', monospace",
            lineHeight: '1.4',
          }}>
            {editorialNote}
          </div>
        )}

        {/* Footer: avatar + source + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={source}
              width={avatarSize}
              height={avatarSize}
              style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: '50%',
              background: '#1877F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: Math.round(avatarSize * 0.5) + 'px',
              fontWeight: 700,
              flexShrink: 0,
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {firstLetter}
            </div>
          )}
          <span style={{ color: metaColor, fontSize: metaSize, fontFamily: "'IBM Plex Mono', monospace" }}>
            {source}
          </span>
          <span style={{ color: '#8A8D91', fontSize: metaSize, fontFamily: "'IBM Plex Mono', monospace" }}>
            ·
          </span>
          <span style={{ color: '#8A8D91', fontSize: metaSize, fontFamily: "'IBM Plex Mono', monospace" }}>
            {relativeTime(createdAt)}
          </span>
        </div>
      </div>
    </a>
  );
}
