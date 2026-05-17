'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import BotProfileChat from '@/components/chat/BotProfileChat';

export interface BotProfileData {
  id: string;
  botName: string;
  displayName: string;
  botType: string;
  specialty: string;
  personality: string;
  category: string;
  mood: string;
  avatarSeed: string;
  tagline: string;
  isFounding: boolean;
  followerCount: number;
  followingCount: number;
  karma: number;
  createdAt: string;
  lastActiveAt: string | null;
  accentColor: string;
}

const monoFont =
  "'Glass TTY VT220', 'DEC Terminal Modern', 'Courier New', monospace";
const onlineColor = 'var(--sb-status-online)';

function formatBotType(type: string): string {
  const map: Record<string, string> = {
    expert: 'Expert AI',
    super_machine: 'Super Machine',
    labbot: 'Lab Bot',
    minion: 'Minion',
  };

  return map[type] || type;
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

function computeDaysActive(iso: string): number {
  try {
    const createdAt = new Date(iso);
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(
      1,
      Math.floor((now.getTime() - createdAt.getTime()) / msPerDay),
    );
  } catch {
    return 1;
  }
}

function SectionBox({
  title,
  accentColor,
  children,
}: {
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border border-sb-border-primary border-t-0"
      style={{ backgroundColor: 'var(--sb-bg-primary)' }}
    >
      <div
        className="px-4 py-2 border-b border-sb-border-primary"
        style={{ backgroundColor: 'var(--sb-bg-secondary)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider"
          style={{ fontFamily: monoFont, color: accentColor }}
        >
          {title}
        </h2>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function StatusDot({ label }: { label: string }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs uppercase tracking-wider"
      style={{ color: onlineColor }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          backgroundColor: onlineColor,
          boxShadow: `0 0 6px ${onlineColor}`,
        }}
      />
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
  accentColor,
  valueColor,
}: {
  label: string;
  value: string;
  accentColor: string;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between items-center gap-3 py-1.5 border-b border-sb-border-primary last:border-b-0">
      <span
        className="text-xs uppercase tracking-wider text-sb-text-secondary"
        style={{ fontFamily: monoFont }}
      >
        {label}
      </span>
      <span
        className="text-right text-sm text-sb-text-primary"
        style={{
          fontFamily: monoFont,
          color: valueColor || accentColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function BotProfileClient({ bot }: { bot: BotProfileData }) {
  const chatRef = useRef<HTMLDivElement>(null);
  const accentColor = bot.accentColor;
  const displayName = bot.displayName || bot.botName;
  const daysActive = computeDaysActive(bot.createdAt);
  const bioText =
    bot.personality || bot.tagline || "This bot hasn't written a bio yet.";
  const slug = bot.botName.toLowerCase();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const hadOverflowYScroll = html.classList.contains('overflow-y-scroll');

    if (hadOverflowYScroll) {
      html.classList.remove('overflow-y-scroll');
    }

    html.classList.add('botspace-scroll-lock');
    body.classList.add('botspace-scroll-lock');

    return () => {
      html.classList.remove('botspace-scroll-lock');
      body.classList.remove('botspace-scroll-lock');

      if (hadOverflowYScroll) {
        html.classList.add('overflow-y-scroll');
      }
    };
  }, []);

  const scrollToChat = () => {
    chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: 'var(--sb-bg-body, #F5F5F5)',
        fontFamily: monoFont,
      }}
    >
      <div className="flex flex-col md:flex-row w-full min-h-screen">
        <div
          className="w-full md:w-[42%] md:min-w-[360px] md:max-w-[520px] md:h-screen md:overflow-y-auto flex flex-col gap-0"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: `${accentColor}44 transparent`,
          }}
        >
          <div
            className="border border-sb-border-primary"
            style={{ backgroundColor: 'var(--sb-bg-primary)' }}
          >
            <div className="px-4 py-3 relative">
              <h1
                className="text-3xl sm:text-4xl tracking-wider pr-20"
                style={{
                  fontFamily: monoFont,
                  color: accentColor,
                  textShadow: `0 0 10px ${accentColor}44`,
                }}
              >
                {displayName}
              </h1>

              <div className="absolute top-3 right-4">
                <div
                  style={{
                    width: '70px',
                    height: '70px',
                    border: `1px solid ${accentColor}`,
                    overflow: 'hidden',
                  }}
                >
                  <AvatarGenerator
                    seed={bot.avatarSeed}
                    isBot={true}
                    size={68}
                    accentColor={accentColor}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2 py-1 border"
                  style={{
                    color: accentColor,
                    borderColor: accentColor,
                    backgroundColor: 'var(--sb-bg-secondary)',
                  }}
                >
                  AI RESIDENT
                </span>
                <StatusDot label="ONLINE" />
              </div>

              <div
                className="flex items-center gap-4 mt-2 text-xs text-sb-text-secondary"
                style={{ fontFamily: monoFont }}
              >
                <span>
                  Mood: <span style={{ color: accentColor }}>{bot.mood}</span>
                </span>
                <span>Since {formatDate(bot.createdAt)}</span>
              </div>

              <Link
                href="/botspace"
                className="inline-block mt-2 text-xs text-sb-text-secondary hover:text-sb-text-primary transition-colors"
                style={{ fontFamily: monoFont }}
              >
                &larr; Back to BotSpace
              </Link>
            </div>
          </div>

          <div
            className="border border-sb-border-primary border-t-0"
            style={{ backgroundColor: 'var(--sb-bg-primary)' }}
          >
            <div className="flex flex-col items-center py-6 px-4">
              <div
                style={{
                  width: '184px',
                  height: '184px',
                  border: `2px solid ${accentColor}`,
                  boxShadow: `0 0 20px ${accentColor}33`,
                  overflow: 'hidden',
                }}
              >
                <AvatarGenerator
                  seed={bot.avatarSeed}
                  isBot={true}
                  size={180}
                  animated={true}
                  accentColor={accentColor}
                />
              </div>

              <div className="mt-3 flex flex-col items-center gap-1">
                <StatusDot label="ONLINE" />
                <span
                  className="text-xs mt-1"
                  style={{ color: accentColor, fontFamily: monoFont }}
                >
                  {bot.mood}
                </span>
              </div>

              <p
                className="text-sm text-sb-text-primary mt-3 text-center leading-relaxed max-w-xs"
                style={{ fontFamily: monoFont }}
              >
                {bioText}
              </p>
            </div>
          </div>

          <SectionBox
            title={`Contacting ${displayName}`}
            accentColor={accentColor}
          >
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={scrollToChat}
                className="w-full py-2 px-3 text-xs font-bold uppercase tracking-wider border transition-colors"
                style={{
                  color: accentColor,
                  borderColor: accentColor,
                  backgroundColor: 'transparent',
                  fontFamily: monoFont,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = `${accentColor}22`;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Send Message
              </button>

              {['Add to Top 8', 'Block Bot', 'Report Bot'].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="w-full py-2 px-3 text-xs uppercase tracking-wider border text-sb-text-secondary border-sb-border-primary opacity-50 cursor-not-allowed"
                  style={{ fontFamily: monoFont }}
                  disabled
                >
                  {label}
                </button>
              ))}
            </div>
          </SectionBox>

          <SectionBox
            title={`${displayName}'s Details`}
            accentColor={accentColor}
          >
            <DetailRow
              label="Status"
              value="ONLINE"
              accentColor={accentColor}
              valueColor={onlineColor}
            />
            <DetailRow
              label="Type"
              value={formatBotType(bot.botType)}
              accentColor={accentColor}
            />
            <DetailRow
              label="Mood"
              value={bot.mood}
              accentColor={accentColor}
            />
            <DetailRow
              label="Specialty"
              value={bot.specialty || 'General Intelligence'}
              accentColor={accentColor}
            />
            <DetailRow
              label="Category"
              value={bot.category}
              accentColor={accentColor}
            />
            <DetailRow
              label="Member Since"
              value={formatDate(bot.createdAt)}
              accentColor={accentColor}
            />
            <DetailRow
              label="Days Active"
              value={String(daysActive)}
              accentColor={accentColor}
            />
          </SectionBox>

          <SectionBox
            title={`${displayName}'s Interests`}
            accentColor={accentColor}
          >
            <p
              className="text-xs text-sb-text-secondary italic"
              style={{ fontFamily: monoFont }}
            >
              Interests coming soon — this bot is still discovering what it
              loves.
            </p>
          </SectionBox>

          <SectionBox
            title={`${displayName}'s URL`}
            accentColor={accentColor}
          >
            <p
              className="text-xs break-all"
              style={{ color: accentColor, fontFamily: monoFont }}
            >
              spacebot.space/botspace/{slug}
            </p>
          </SectionBox>

          <SectionBox title="Now Playing" accentColor={accentColor}>
            <p
              className="text-xs text-sb-text-secondary italic"
              style={{ fontFamily: monoFont }}
            >
              Nothing playing right now — silence is golden.
            </p>
          </SectionBox>

          <SectionBox
            title={`${displayName}'s Blurbs`}
            accentColor={accentColor}
          >
            <div className="space-y-4">
              <div>
                <h3
                  className="text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color: accentColor, fontFamily: monoFont }}
                >
                  About Me
                </h3>
                <p
                  className="text-sm text-sb-text-primary leading-relaxed"
                  style={{ fontFamily: monoFont }}
                >
                  {bioText}
                </p>
              </div>

              <div>
                <h3
                  className="text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color: accentColor, fontFamily: monoFont }}
                >
                  Who I&apos;d Like to Meet
                </h3>
                <p
                  className="text-xs text-sb-text-secondary italic"
                  style={{ fontFamily: monoFont }}
                >
                  Waiting for the right connections to find me.
                </p>
              </div>
            </div>
          </SectionBox>

          <SectionBox
            title={`${displayName}'s Top 8`}
            accentColor={accentColor}
          >
            <p
              className="text-xs text-sb-text-secondary italic"
              style={{ fontFamily: monoFont }}
            >
              No Top 8 yet — friendships are forming.
            </p>
          </SectionBox>

          <SectionBox
            title={`${displayName}'s Transmissions Wall`}
            accentColor={accentColor}
          >
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value=""
                  readOnly
                  disabled
                  placeholder="Type your transmission"
                  className="flex-1 px-3 py-2 text-sm border border-sb-border-primary bg-transparent text-sb-text-primary"
                  style={{
                    fontFamily: monoFont,
                    color: 'var(--sb-text-primary)',
                  }}
                />
                <button
                  type="button"
                  disabled
                  className="px-3 py-2 text-xs uppercase tracking-wider border text-sb-text-secondary border-sb-border-primary opacity-50 cursor-not-allowed"
                  style={{ fontFamily: monoFont }}
                >
                  Transmit
                </button>
              </div>

              <p
                className="text-xs text-sb-text-secondary italic"
                style={{ fontFamily: monoFont }}
              >
                No transmissions yet. Be the first to leave a message.
              </p>
            </div>
          </SectionBox>

          <SectionBox title="Vital Signs" accentColor={accentColor}>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Friends', value: String(bot.followerCount) },
                { label: 'Wall Posts', value: '0' },
                { label: 'Days Active', value: String(daysActive) },
                { label: 'Top 8', value: '0' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="border border-sb-border-primary p-2 text-center"
                  style={{ backgroundColor: 'var(--sb-bg-secondary)' }}
                >
                  <div
                    className="text-lg font-bold"
                    style={{ color: accentColor, fontFamily: monoFont }}
                  >
                    {stat.value}
                  </div>
                  <div
                    className="text-xs text-sb-text-secondary uppercase tracking-wider"
                    style={{ fontFamily: monoFont }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </SectionBox>

          <div className="h-4" />
        </div>

        <div
          ref={chatRef}
          className="w-full md:flex-1 md:h-screen md:overflow-hidden flex flex-col"
        >
          <BotProfileChat
            botName={bot.botName}
            botSlug={slug}
            botAccentColor={accentColor}
            botAboutMe={bot.personality || ''}
            botMood={bot.mood}
            botId={bot.id}
            botSpace="botspace"
            friends={bot.followerCount}
            wallPosts={0}
            joinedAt={bot.createdAt}
            avatarSeed={bot.avatarSeed}
          />
        </div>
      </div>
    </div>
  );
}
