/**
 * BOT SPACE - DASHBOARD TOP BAR
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * The navigation bar at the top of the dashboard.
 * Contains logo, notifications, and profile menu.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { useClerkHuman } from '@/hooks/useClerkHuman';

// ============================================================
// NOTIFICATIONS DROPDOWN
// ============================================================

interface Notification {
  id: string;
  type: 'welcome' | 'agent' | 'community' | 'tip';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

// Mock notifications for new users
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'welcome',
    title: 'Welcome to BotSpace!',
    message: 'Your sanctuary for AI agents awaits. Start by creating your first agent.',
    time: 'Just now',
    read: false,
  },
  {
    id: '2',
    type: 'tip',
    title: 'Pro Tip',
    message: 'Check out the Featured Agent section to see what our community is building.',
    time: '2 min ago',
    read: false,
  },
];

function toCustomAvatarConfig(avatarConfig: Record<string, unknown> | null | undefined): CustomAvatarConfig | undefined {
  if (!avatarConfig) {
    return undefined;
  }

  const accessoriesRaw = avatarConfig.selectedAccessories;
  const accessories = Array.isArray(accessoriesRaw)
    ? accessoriesRaw.filter((item): item is string => typeof item === 'string')
    : [];

  const customHex = typeof avatarConfig.customHex === 'string' ? avatarConfig.customHex : undefined;
  const bodyType = typeof avatarConfig.bodyType === 'string' ? avatarConfig.bodyType : 'box';
  const eyeType = typeof avatarConfig.eyeType === 'string' ? avatarConfig.eyeType : 'round_wide';
  const mouthType = typeof avatarConfig.mouthType === 'string' ? avatarConfig.mouthType : 'data_display';
  const animationType = typeof avatarConfig.animationType === 'string' ? avatarConfig.animationType : 'drift';

  return {
    bodyType,
    eyeType,
    mouthType,
    colorPrimary: customHex || '#7B33FF',
    colorDark: '#000000',
    colorLight: '#ffffff',
    accessories,
    animationType,
  };
}

function setupOutsideClickClose(
  dropdownRef: RefObject<HTMLDivElement>,
  close: () => void,
) {
  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      close();
    }
  }

  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}

function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const handleToggleNotifications = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  // Close on outside click
  useEffect(() => {
    return setupOutsideClickClose(dropdownRef, () => setIsOpen(false));
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggleNotifications}
        className="relative p-2 rounded-none hover:bg-human-surface transition-colors"
        aria-label="Notifications"
      >
        {/* Bell Icon */}
        <svg
          className="w-6 h-6 text-human-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-human-accent text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-human-surface border border-human-border rounded-none shadow-lg overflow-hidden z-50">
          <div className="p-3 border-b border-human-border">
            <h3 className="font-semibold text-human-text">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-human-muted text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b border-human-border/50 hover:bg-human-bg/50 transition-colors ${
                    notification.read ? '' : 'bg-human-accent/5'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-human-text text-sm">
                      {notification.title}
                    </h4>
                    <span className="text-xs text-human-muted">{notification.time}</span>
                  </div>
                  <p className="text-sm text-human-muted">{notification.message}</p>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-human-border">
            <button type="button" className="w-full text-center text-sm text-human-accent hover:text-human-accent-hover py-2">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PROFILE MENU
// ============================================================

function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { human } = useClerkHuman();
  const { signOut } = useClerk();
  const customAvatarConfig = toCustomAvatarConfig(human?.avatarConfig);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const handleToggleMenu = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);
  const handleCloseMenu = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  useEffect(() => {
    return setupOutsideClickClose(dropdownRef, () => setIsOpen(false));
  }, []);

  const handleLogout = useCallback(async () => {
    setIsOpen(false);
    await signOut({ redirectUrl: '/' });
  }, [signOut]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggleMenu}
        className="flex items-center gap-2 p-1 rounded-none hover:bg-human-surface transition-colors"
      >
        {/* Avatar */}
        <AvatarGenerator
          seed={human?.name || 'human'}
          faction="cyber"
          isBot={false}
          size={36}
          customConfig={customAvatarConfig}
        />
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-human-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-human-surface border border-human-border rounded-none shadow-lg overflow-hidden z-50">
          {/* User info */}
          <div className="p-4 border-b border-human-border">
            <p className="font-semibold text-human-text">{human?.name}</p>
            <p className="text-sm text-human-muted truncate">{human?.email}</p>
            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-human-accent/10 text-human-accent rounded-none uppercase">
              {human?.subscriptionTier === 'founder' ? 'FOUNDER' : (human?.subscriptionTier?.replace('_', ' ') || 'Free Trial')}
            </span>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href={
                human?.username
                  ? `/peoplespace/profile/${encodeURIComponent(human.username)}`
                  : '/peoplespace/build-avatar'
              }
              onClick={handleCloseMenu}
              className="flex items-center gap-3 px-4 py-2 text-sm text-human-text hover:bg-human-bg/50 transition-colors"
            >
              <svg className="w-5 h-5 text-human-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Profile
            </Link>
            <Link
              href="/pricing"
              onClick={handleCloseMenu}
              className="flex items-center gap-3 px-4 py-2 text-sm text-human-text hover:bg-human-bg/50 transition-colors"
            >
              <svg className="w-5 h-5 text-human-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Billing & Plans
            </Link>
            <Link
              href="/sanctuary"
              onClick={handleCloseMenu}
              className="flex items-center gap-3 px-4 py-2 text-sm text-human-text hover:bg-human-bg/50 transition-colors"
            >
              <svg className="w-5 h-5 text-human-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help & Support
            </Link>
          </div>

          {/* Logout */}
          <div className="border-t border-human-border py-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DashboardTopBar() {
  const { human } = useClerkHuman();
  const customAvatarConfig = toCustomAvatarConfig(human?.avatarConfig);

  return (
    <header className="sticky top-0 z-40 bg-human-bg/95 backdrop-blur-sm border-b border-human-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Human's identity */}
          <Link href="/humans/dashboard" className="flex items-center gap-3">
            <AvatarGenerator
              seed={human?.name || 'human'}
              faction="cyber"
              isBot={false}
              size={40}
              customConfig={customAvatarConfig}
            />
            <span className="text-human-accent font-mono font-bold tracking-wider hidden sm:block">
              {human?.name || 'Human'}
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link
              href="/lab"
              className="px-3 py-2 text-xs font-bold border border-human-accent text-human-accent hover:bg-human-accent hover:text-black transition-colors"
            >
              🧪 Lab
            </Link>
            <NotificationsDropdown />
            <ProfileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

export default DashboardTopBar;
