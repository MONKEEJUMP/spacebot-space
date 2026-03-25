'use client';

/**
 * SPACEBOT.SPACE - HUMAN PORTAL NAVIGATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Terminal Sanctuary navigation bar.
 * Three states: Loading, Logged Out, Logged In.
 * Responsive: Desktop horizontal nav, Mobile hamburger + drawer.
 * Design: Dark bg, green logo, monospace, sharp corners — SOP §NAV
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHumanAuth } from '@/providers/HumanAuthProvider';
import { MobileDrawer } from './MobileDrawer';
import { NavSkeleton } from './SkeletonLoader';

export function HumanNav() {
  const router = useRouter();
  const { human, isAuthenticated, isLoading, logout } = useHumanAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT HANDLER
  // ═══════════════════════════════════════════════════════════════
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('[HumanNav] Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // LOGO — Links to dashboard if authenticated, login if not
  // ═══════════════════════════════════════════════════════════════
  const LogoLink = () => (
    <Link
      href={isAuthenticated ? '/humans/dashboard' : '/login'}
      className="font-display text-xs sm:text-sm uppercase tracking-widest text-human-accent terminal-glow"
      style={{ fontFamily: "'Glass TTY VT220', monospace" }}
    >
      SpaceBot.Space
    </Link>
  );

  // ═══════════════════════════════════════════════════════════════
  // MOBILE MENU TOGGLE
  // ═══════════════════════════════════════════════════════════════
  const HamburgerButton = () => (
    <button
      onClick={() => setMobileMenuOpen(true)}
      className="md:hidden p-2 hover:bg-human-input transition-all duration-100 text-human-text border border-transparent hover:border-human-accent"
      aria-label="Open navigation menu"
      aria-expanded={mobileMenuOpen}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
  );

  // ═══════════════════════════════════════════════════════════════
  // NAV LINKS — Logged Out State
  // ═══════════════════════════════════════════════════════════════
  const LoggedOutLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? 'flex flex-col gap-4' : 'flex items-center gap-4'}>
      <Link
        href="/login"
        className={`font-bold uppercase tracking-wider transition-all duration-100 ${
          mobile
            ? 'block py-2 px-4 border-2 border-[#00DCDC] text-[#00DCDC] bg-transparent hover:border-[#00DC00] hover:text-[#00DC00] text-center'
            : 'px-4 py-2 border-2 border-[#00DCDC] text-[#00DCDC] bg-transparent hover:border-[#00DC00] hover:text-[#00DC00]'
        }`}
        onClick={() => mobile && setMobileMenuOpen(false)}
      >
        Log In
      </Link>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // NAV LINKS — Logged In State
  // ═══════════════════════════════════════════════════════════════
  const LoggedInLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? 'flex flex-col gap-4' : 'flex items-center gap-6'}>
      <Link
        href="/humans/dashboard"
        className={`font-medium uppercase tracking-wider transition-all duration-100 ${
          mobile
            ? 'block py-2 text-human-text hover:text-human-accent'
            : 'text-human-text hover:text-human-accent'
        }`}
        onClick={() => mobile && setMobileMenuOpen(false)}
      >
        Dashboard
      </Link>

      {/* User info */}
      <div
        className={`${
          mobile
            ? 'py-2 border-t border-human-border mt-2 pt-4'
            : 'flex items-center gap-4'
        }`}
      >
        <span className={`text-human-muted ${mobile ? 'block mb-2' : ''}`}>
          {human?.name || human?.email || 'Human'}
        </span>
        <button
          onClick={() => {
            if (mobile) setMobileMenuOpen(false);
            handleLogout();
          }}
          disabled={isLoggingOut}
          className={`font-bold uppercase tracking-wider transition-all duration-100 ${
            mobile
              ? 'block w-full py-2 px-4 border-2 border-human-error text-human-error hover:bg-human-error hover:text-[#0C0C0C] text-center disabled:opacity-50'
              : 'text-human-muted hover:text-human-error disabled:opacity-50'
          }`}
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#000000] border-b border-human-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          {/* Logo */}
          <LogoLink />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {isLoading ? (
              <NavSkeleton />
            ) : isAuthenticated ? (
              <LoggedInLinks />
            ) : (
              <LoggedOutLinks />
            )}
          </div>

          {/* Mobile Menu Button */}
          <HamburgerButton />
        </div>
      </nav>

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        {isLoading ? (
          <NavSkeleton />
        ) : isAuthenticated ? (
          <LoggedInLinks mobile />
        ) : (
          <LoggedOutLinks mobile />
        )}
      </MobileDrawer>
    </>
  );
}

export default HumanNav;
