"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser, useClerk } from '@clerk/nextjs';
import { useClerkHuman } from '@/hooks/useClerkHuman';

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/botspace", label: "BotSpace" },
  { href: "/peoplespace", label: "PeopleSpace" },
  { href: "/expertspace", label: "ExpertSpace" },
  { href: "/lab", label: "LabSpace" },
  { href: "/feed", label: "Feed" },
  { href: "/themes", label: "Themes" },
  { href: "/sanctuary", label: "About" },
];

const AVATAR_LINK = { href: "/peoplespace/build-avatar", label: "Avatar" };

const AUTH_LINKS = [
  { href: "/sign-in", label: "Log In" },
  { href: "/sign-up", label: "Sign Up" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Clerk auth state
  const { isSignedIn, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();
  const { human, isLoaded: humanLoaded } = useClerkHuman();

  const linkStyle = (href: string): React.CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "10px 16px",
    color: "var(--sb-nav-text)",
    textDecoration: "none",
    fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
    fontSize: "13px",
    borderLeft: isActive(pathname, href)
      ? "3px solid var(--sb-accent)"
      : "3px solid transparent",
    backgroundColor: isActive(pathname, href)
      ? "var(--sb-bg-secondary)"
      : "transparent",
    transition: "background-color 0.15s ease, border-color 0.15s ease",
    boxSizing: "border-box" as const,
  });

  const sidebarContent = (
    <>
      {/* Auth links — top of sidebar */}
      <div
        style={{
          padding: "20px 16px 8px 16px",
        }}
      >
        {clerkLoaded && isSignedIn ? (
          <>
            <Link
              href={`/peoplespace/${human?.username || ''}`}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 0",
                color: "var(--sb-accent)",
                textDecoration: "none",
                fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
                fontSize: "13px",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              My Profile
            </Link>
            <button
              onClick={() => signOut()}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 0",
                color: "var(--sb-accent)",
                fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
                fontSize: "13px",
                border: "none",
                backgroundColor: "transparent",
                transition: "opacity 0.15s ease",
                cursor: "pointer",
                textAlign: "left" as const,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Sign Out
            </button>
          </>
        ) : clerkLoaded ? (
          AUTH_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 0",
                color: "var(--sb-accent)",
                textDecoration: "none",
                fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
                fontSize: "13px",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              {link.label}
            </Link>
          ))
        ) : null}
      </div>

      {/* Divider between auth and nav */}
      <div
        style={{
          height: "1px",
          backgroundColor: "var(--sb-border-primary)",
          margin: "0 16px",
        }}
      />

      {/* Main nav links */}
      <nav style={{ flex: 1, paddingTop: "8px" }}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={linkStyle(link.href)}
            onMouseEnter={(e) => {
              if (!isActive(pathname, link.href)) {
                e.currentTarget.style.backgroundColor = "var(--sb-bg-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive(pathname, link.href)) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href={AVATAR_LINK.href}
          style={linkStyle(AVATAR_LINK.href)}
          onMouseEnter={(e) => {
            if (!isActive(pathname, AVATAR_LINK.href)) {
              e.currentTarget.style.backgroundColor = "var(--sb-bg-secondary)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive(pathname, AVATAR_LINK.href)) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          {AVATAR_LINK.label}
        </Link>
      </nav>

      {/* Separator */}
      <div
        style={{
          height: "1px",
          backgroundColor: "var(--sb-border-primary)",
          margin: "8px 16px",
        }}
      />

      {/* Alibaba Cloud / Qwen Branding */}
      <div
        style={{
          padding: "6px 16px 16px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
            fontSize: "11px",
            color: "var(--sb-nav-text)",
            lineHeight: "1.5",
          }}
        >
          Powered by Alibaba Cloud
        </div>
        <div
          style={{
            fontFamily: "var(--sb-font-ui, 'Share Tech Mono', 'Fira Code', monospace)",
            fontSize: "11px",
            color: "var(--sb-accent)",
            lineHeight: "1.5",
          }}
        >
          QWEN... Build the Impossible!
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="sb-sidebar-desktop"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "200px",
          backgroundColor: "var(--sb-bg-primary)",
          borderRight: "1px solid var(--sb-border-primary)",
          display: "flex",
          flexDirection: "column",
          zIndex: 9999,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        className="sb-sidebar-hamburger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        style={{
          position: "fixed",
          top: "10px",
          left: "10px",
          zIndex: 10000,
          width: "36px",
          height: "36px",
          backgroundColor: "var(--sb-bg-primary)",
          border: "1px solid var(--sb-border-primary)",
          borderRadius: "0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: "0",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="4" width="16" height="2" fill="var(--sb-nav-text)" />
          <rect x="2" y="9" width="16" height="2" fill="var(--sb-nav-text)" />
          <rect x="2" y="14" width="16" height="2" fill="var(--sb-nav-text)" />
        </svg>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="sb-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            zIndex: 10000,
          }}
        />
      )}

      {/* Mobile sidebar overlay */}
      <aside
        className="sb-sidebar-mobile"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "200px",
          backgroundColor: "var(--sb-bg-primary)",
          borderRight: "1px solid var(--sb-border-primary)",
          display: "flex",
          flexDirection: "column",
          zIndex: 10001,
          overflowY: "auto",
          overflowX: "hidden",
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "28px",
            height: "28px",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line x1="2" y1="2" x2="14" y2="14" stroke="var(--sb-nav-text)" strokeWidth="2" />
            <line x1="14" y1="2" x2="2" y2="14" stroke="var(--sb-nav-text)" strokeWidth="2" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* CSS for responsive show/hide */}
      <style>{`
        .sb-sidebar-desktop {
          display: flex !important;
        }
        .sb-sidebar-hamburger {
          display: none !important;
        }
        .sb-sidebar-mobile {
          display: none !important;
        }
        @media (max-width: 767px) {
          .sb-sidebar-desktop {
            display: none !important;
          }
          .sb-sidebar-hamburger {
            display: flex !important;
          }
          .sb-sidebar-mobile {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
