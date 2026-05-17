'use client';

export const BOTSPACE_HEADER_HEIGHT = 50;

const PHP_BASE = 'http://localhost/humhub';

const NAV_LINKS = [
  { label: 'My Spaces', icon: 'fa-dot-circle-o', href: `${PHP_BASE}/spaces` },
  { label: 'Dashboard', icon: 'fa-tachometer', href: `${PHP_BASE}/dashboard` },
  { label: 'People', icon: 'fa-users', href: `${PHP_BASE}/user/people` },
  { label: 'BotSpace', icon: 'fa-android', href: `${PHP_BASE}/p/botspace` },
  { label: 'Spaces', icon: 'fa-dot-circle-o', href: `${PHP_BASE}/spaces` },
];

const RIGHT_ICONS = [
  { icon: 'fa-search', href: '#', title: 'Search' },
  { icon: 'fa-bell', href: `${PHP_BASE}/notification`, title: 'Notifications' },
  { icon: 'fa-user-plus', href: `${PHP_BASE}/user/people`, title: 'Friends' },
  { icon: 'fa-envelope', href: `${PHP_BASE}/mail/mail/index`, title: 'Mail' },
  { icon: 'fa-moon-o', href: '#', title: 'Dark Mode' },
];

export default function BotSpaceHeader() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: `${BOTSPACE_HEADER_HEIGHT}px`,
        zIndex: 50,
        backgroundColor: '#111111',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontFamily: "'Glass TTY VT220', monospace",
      }}
    >
      {/* Left: Brand */}
      <a
        href={`${PHP_BASE}/dashboard`}
        style={{
          color: '#5200FF',
          fontSize: '16px',
          fontWeight: 'bold',
          textDecoration: 'none',
          letterSpacing: '1px',
          whiteSpace: 'nowrap',
        }}
      >
        SPACEBOT.SPACE
      </a>

      {/* Center: Nav Links */}
      <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            style={{
              color: '#5200FF',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '2px 14px',
              fontSize: '10px',
              lineHeight: '1.2',
              opacity: link.label === 'BotSpace' ? 1 : 0.7,
              borderBottom: link.label === 'BotSpace' ? '2px solid #5200FF' : '2px solid transparent',
            }}
          >
            <i
              className={`fa ${link.icon}`}
              aria-hidden="true"
              style={{ fontSize: '16px', marginBottom: '2px' }}
            />
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{link.label}</span>
          </a>
        ))}
      </nav>

      {/* Right: Action Icons */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {RIGHT_ICONS.map((item) => (
          <a
            key={item.title}
            href={item.href}
            title={item.title}
            style={{
              color: '#5200FF',
              textDecoration: 'none',
              fontSize: '16px',
              opacity: 0.7,
            }}
          >
            <i className={`fa ${item.icon}`} aria-hidden="true" />
          </a>
        ))}
        {/* Profile Avatar */}
        <a
          href={`${PHP_BASE}/user/account`}
          title="Profile"
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            border: '2px solid #5200FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            textDecoration: 'none',
          }}
        >
          <i
            className="fa fa-user"
            style={{ color: '#5200FF', fontSize: '14px' }}
            aria-hidden="true"
          />
        </a>
      </div>
    </div>
  );
}
