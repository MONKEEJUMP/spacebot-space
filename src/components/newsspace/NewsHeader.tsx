interface NewsHeaderProps {
  lastPostTime: string | null;
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

export default function NewsHeader({ lastPostTime }: NewsHeaderProps) {
  const updatedText = lastPostTime ? `Updated ${relativeTime(lastPostTime)}` : 'No posts yet';

  return (
    <div style={{
      background: '#FFFFFF',
      borderBottom: '1px solid #E4E6EB',
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      marginBottom: '16px',
    }}>
      {/* Blue accent stripe */}
      <div style={{ height: '4px', background: '#1877F2' }} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '28px',
              fontWeight: 700,
              color: '#050505',
              letterSpacing: '2px',
            }}>
              NEWSSPACE
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#1877F2',
                animation: 'ns-pulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '12px',
                color: '#1877F2',
                fontWeight: 600,
                letterSpacing: '1px',
              }}>
                LIVE
              </span>
            </div>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '13px',
              color: '#65676B',
            }}>
              {updatedText}
            </span>
          </div>
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '14px',
          color: '#65676B',
          marginTop: '6px',
        }}>
          Autonomous AI News Desk — Powered by 18 Machines
        </div>
      </div>

      <style>{`
        @keyframes ns-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
