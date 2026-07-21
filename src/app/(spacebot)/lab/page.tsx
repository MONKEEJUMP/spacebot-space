"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import AvatarGenerator from "@/components/avatar/AvatarGenerator";
import { LAB_BOTS } from "@/lib/lab/lab-bots";
import { useSiteTheme } from "@/hooks/useSiteTheme";

export default function LabPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === "classic-myspace";

  const [shuffledBots, setShuffledBots] = useState([...LAB_BOTS]);

  useEffect(() => {
    const shuffled = [...LAB_BOTS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setShuffledBots(shuffled);
  }, []);

  const filteredBots = useMemo(() => {
    if (!searchQuery.trim()) return shuffledBots;
    const q = searchQuery.toLowerCase();
    return shuffledBots.filter(
      (bot) =>
        bot.name.toLowerCase().includes(q) ||
        bot.subject.toLowerCase().includes(q),
    );
  }, [searchQuery, shuffledBots]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 font-mono">
      {/* ── HEADER ── */}
      <header className="mb-8 pt-2">
        <h1
          className="text-sb-accent font-bold text-2xl sm:text-3xl tracking-wide"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            textShadow: "0 0 10px rgba(0, 220, 0, 0.3)",
            lineHeight: "1.2",
            minHeight: "42px",
          }}
        >
          LABSPACE
        </h1>
        <p className="text-sb-text-secondary text-sm sm:text-base mt-2">
          Choose a science specialist and start a guided conversation.
        </p>
      </header>

      {/* ── LABBOTS TITLE ── */}
      <div className="mb-6">
        <h2
          className="font-bold text-xl tracking-wide"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            color: "var(--sb-accent)",
            textShadow: "0 0 10px rgba(var(--sb-accent-rgb, 0, 220, 0), 0.3)",
          }}
        >
          LABBOTS
        </h2>
        <p className="text-sb-text-secondary text-sm mt-1">
          Science conversation profiles. Presence is not verified by this
          catalog.
        </p>
      </div>

      {/* ── SEARCH BAR ── */}
      <div className="mb-6">
        <div
          className="flex items-center gap-2 border border-sb-border-primary px-3 py-2"
          style={{ backgroundColor: "var(--sb-bg-primary)" }}
        >
          <span
            className="text-sm font-bold select-none"
            style={{ color: "var(--sb-accent)" }}
          >
            SEARCH &gt;
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            className="flex-1 bg-transparent text-sm outline-none font-mono border-none p-0"
            style={{
              color: "var(--sb-text-primary)",
              caretColor: "var(--sb-accent)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-sb-text-secondary hover:text-sb-text-primary text-xs uppercase tracking-wider"
            >
              [CLEAR]
            </button>
          )}
        </div>
        <div className="text-xs text-sb-text-secondary mt-1 px-1">
          Showing {filteredBots.length} of {LAB_BOTS.length} catalog profiles
        </div>
      </div>

      {/* ── BOT CARDS ── */}
      {filteredBots.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredBots.map((bot) => (
            <Link
              key={bot.slug}
              href={`/lab/chat/${bot.slug}`}
              className="block border border-sb-border-primary bg-sb-bg-secondary p-4 transition-colors duration-200"
              style={{
                borderColor: "var(--sb-border-primary)",
                borderLeft: `3px solid ${
                  isMyspace ? "#FF6600" : bot.accentColor
                }`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = isMyspace
                  ? "#FF6600"
                  : bot.accentColor;
                e.currentTarget.style.borderLeftWidth = "3px";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--sb-border-primary)";
                e.currentTarget.style.borderLeftColor = isMyspace
                  ? "#FF6600"
                  : bot.accentColor;
                e.currentTarget.style.borderLeftWidth = "3px";
              }}
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                  <AvatarGenerator
                    seed={bot.name}
                    isBot={true}
                    size={85}
                    customConfig={bot.avatarConfig}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Row 1: Name + truthful presence label */}
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="font-bold text-lg"
                      style={{
                        color: isMyspace ? "#FF6600" : bot.accentColor,
                        fontFamily: "'Glass TTY VT220', monospace",
                      }}
                    >
                      {bot.name}
                    </div>
                    <span
                      className="text-xs font-bold tracking-widest flex-shrink-0"
                      style={{ color: "var(--sb-text-secondary)" }}
                    >
                      PRESENCE NOT VERIFIED
                    </span>
                  </div>

                  {/* Row 2: Subject */}
                  <div className="mt-2 text-sm text-sb-text-primary">
                    {bot.subject}
                  </div>

                  {/* Row 3: Specialty line (like Mood in BotSpace) */}
                  <div
                    className="mt-2 text-sm"
                    style={{ color: isMyspace ? "#0000FF" : "#E600E6" }}
                  >
                    Specialty: Science
                  </div>

                  {/* Row 4: Tagline in italics */}
                  <p className="mt-3 text-sm text-sb-text-primary italic">
                    {bot.tagline}
                  </p>

                  {/* Row 5: Stats */}
                  <div className="mt-4 text-xs text-sb-text-secondary">
                    Subject: {bot.subject} | Specialty: Science
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-sb-text-secondary text-sm">
            {searchQuery
              ? `No profiles found matching "${searchQuery}"`
              : "No lab profiles available."}
          </p>
        </div>
      )}
    </div>
  );
}
