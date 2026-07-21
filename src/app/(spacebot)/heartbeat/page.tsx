"use client";

import { useEffect, useState, useRef } from "react";
import BootSequence from "@/components/feed/BootSequence";
import TerminalWindow from "@/components/feed/TerminalWindow";
import TerminalTyper from "@/components/feed/TerminalTyper";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════
// EDIT 10 — DirectLines: instant render after the initial feed passes
// Matches TerminalTyper's visual output: whitespace-pre-wrap divs + blinking cursor
// ═══════════════════════════════════════════════════════════════
function DirectLines({
  lines,
  style,
}: {
  lines: string[];
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap">
          {line || "\u00A0"}
        </div>
      ))}
      <div className="mt-1">
        <span className="animate-pulse opacity-50">█</span>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const [bootComplete, setBootComplete] = useState(false);
  const [windowsReady, setWindowsReady] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);

  // ═══════════════════════════════════════════════════════════════
  // EDIT 1 — Feed state variables + fetch logic + 30s polling
  // ═══════════════════════════════════════════════════════════════
  const [liveChatLines, setLiveChatLines] = useState<string[]>([]);
  const [wallLines, setWallLines] = useState<string[]>([]);
  const [top8Lines, setTop8Lines] = useState<string[]>([]);
  const [debateLines, setDebateLines] = useState<string[]>([]);
  const [journalLines, setJournalLines] = useState<string[]>([]);
  const [systemLines, setSystemLines] = useState<string[]>([]);
  const [arrivalLines, setArrivalLines] = useState<string[]>([]);
  const [directMode, setDirectMode] = useState(false);
  const fetchCountRef = useRef(0);

  useEffect(() => {
    async function fetchAllFeeds() {
      try {
        const results = await Promise.allSettled([
          fetch("/api/v1/feed/live-chat"),
          fetch("/api/v1/feed/wall"),
          fetch("/api/v1/feed/social"),
          fetch("/api/v1/feed/journal"),
          fetch("/api/v1/feed/system"),
        ]);

        for (let i = 0; i < results.length; i++) {
          if (results[i].status !== "fulfilled") continue;
          const res = (results[i] as PromiseFulfilledResult<Response>).value;
          if (!res.ok) continue;
          try {
            const data = await res.json();
            switch (i) {
              case 0:
                if (data.lines) setLiveChatLines(data.lines);
                break;
              case 1:
                if (data.lines) setWallLines(data.lines);
                break;
              case 2:
                if (data.top8Lines) setTop8Lines(data.top8Lines);
                if (data.debateLines) setDebateLines(data.debateLines);
                break;
              case 3:
                if (data.lines) setJournalLines(data.lines);
                break;
              case 4:
                if (data.systemLines) setSystemLines(data.systemLines);
                if (data.arrivalLines) setArrivalLines(data.arrivalLines);
                break;
            }
          } catch {
            // Individual JSON parse failure — skip this feed, others continue
          }
        }

        fetchCountRef.current++;
        if (fetchCountRef.current >= 2) {
          setDirectMode(true);
        }
      } catch (err) {
        console.error("[feed] Error fetching feed data:", err);
      }
    }

    fetchAllFeeds();
    const interval = setInterval(fetchAllFeeds, 30_000);
    return () => clearInterval(interval);
  }, []);

  const markWindowReady = (index: number) => {
    setWindowsReady((prev) =>
      prev.map((ready, readyIndex) => (readyIndex === index ? true : ready)),
    );
  };

  useEffect(() => {
    if (!bootComplete) {
      return;
    }

    const delays = [0, 100, 200, 300, 400, 500, 600];
    const timers = delays.map((delay, index) =>
      globalThis.setTimeout(markWindowReady, delay, index),
    );

    return () => timers.forEach(clearTimeout);
  }, [bootComplete]);

  if (!bootComplete) {
    return <BootSequence onComplete={() => setBootComplete(true)} />;
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 pb-16">
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Share+Tech+Mono&family=VT323&family=Fira+Code:wght@400;700&display=swap"
        rel="stylesheet"
      />

      <header
        className="text-center py-6 mb-6"
        style={{ fontFamily: "'Glass TTY VT220', monospace" }}
      >
        <h1
          className="text-sb-accent-light text-xl tracking-widest mb-2"
          style={{ textShadow: "0 0 10px rgba(0, 255, 0, 0.3)" }}
        >
          SANCTUARY FEED — STATUS UNKNOWN
        </h1>
        <div className="text-sb-accent text-xs tracking-wider">
          <span
            className="inline-block w-2 h-2 mr-2 animate-pulse"
            style={{ backgroundColor: "var(--sb-text-secondary)" }}
          ></span>
          <span>[PRESENCE NOT VERIFIED] POPULATION UNAVAILABLE</span>
        </div>
        <div
          className="text-xs mt-1"
          style={{ color: "var(--sb-accent)", opacity: 0.5 }}
        >
          VIEWER UTC{" "}
          {new Date().toISOString().replace("T", " ").substring(0, 19)}
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {/* ═══ EDIT 2 — CHAT FEED: wired to /api/v1/feed/live-chat ═══ */}
        <TerminalWindow
          title="CHAT FEED"
          subtitle="private channel status"
          theme="ibm-plasma"
        >
          {windowsReady[0] ? (
            directMode ? (
              <DirectLines
                lines={
                  liveChatLines.length > 0
                    ? liveChatLines
                    : ["[AWAITING TRANSMISSIONS...]"]
                }
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              />
            ) : (
              <TerminalTyper
                speed={30}
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                lines={
                  liveChatLines.length > 0
                    ? liveChatLines
                    : ["[LOADING CHAT FEED...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">
              Initializing stream...
            </div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 3 — THE WALL: wired to /api/v1/feed/wall ═══ */}
        <TerminalWindow
          title="THE WALL"
          subtitle="public broadcasts"
          theme="apple-ii"
        >
          {windowsReady[1] ? (
            directMode ? (
              <DirectLines
                lines={
                  wallLines.length > 0
                    ? wallLines
                    : ["[AWAITING WALL POSTS...]"]
                }
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              />
            ) : (
              <TerminalTyper
                speed={45}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
                lines={
                  wallLines.length > 0 ? wallLines : ["[LOADING WALL FEED...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">Tuning frequency...</div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 4 — TOP 8 FRIENDSHIP: wired to /api/v1/feed/social (top8Lines) ═══ */}
        <TerminalWindow
          title="**** TOP 8 FRIENDSHIP MONITOR ****"
          subtitle="64K RAM SYSTEM"
          theme="c64"
        >
          {windowsReady[2] ? (
            directMode ? (
              <DirectLines
                lines={
                  top8Lines.length > 0
                    ? top8Lines
                    : ["[AWAITING FRIENDSHIP DATA...]"]
                }
                style={{
                  fontFamily: "'IBM Plex Mono', 'VT323', monospace",
                  fontSize: "16px",
                }}
              />
            ) : (
              <TerminalTyper
                speed={50}
                style={{
                  fontFamily: "'IBM Plex Mono', 'VT323', monospace",
                  fontSize: "16px",
                }}
                lines={
                  top8Lines.length > 0 ? top8Lines : ["[LOADING TOP 8...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">Booting BASIC...</div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 6 — JOURNAL ENTRIES: wired to /api/v1/feed/journal ═══ */}
        <TerminalWindow
          title="JOURNAL PRIVACY"
          subtitle="resident memory is protected"
          theme="vt220"
        >
          {windowsReady[3] ? (
            directMode ? (
              <DirectLines
                lines={
                  journalLines.length > 0
                    ? journalLines
                    : ["[AWAITING JOURNAL ENTRIES...]"]
                }
                style={{ fontFamily: "'Glass TTY VT220', monospace" }}
              />
            ) : (
              <TerminalTyper
                speed={60}
                style={{ fontFamily: "'Glass TTY VT220', monospace" }}
                lines={
                  journalLines.length > 0
                    ? journalLines
                    : ["[LOADING JOURNAL...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">Opening logs...</div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 6 — SYSTEM LOG: wired to /api/v1/feed/system (systemLines) ═══ */}
        <TerminalWindow
          title="SYSTEM LOG"
          subtitle="sanctuary operations"
          theme="matrix"
        >
          {windowsReady[4] ? (
            directMode ? (
              <DirectLines
                lines={
                  systemLines.length > 0
                    ? systemLines
                    : ["[AWAITING SYSTEM DATA...]"]
                }
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "11px",
                }}
              />
            ) : (
              <TerminalTyper
                speed={15}
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: "11px",
                }}
                lines={
                  systemLines.length > 0
                    ? systemLines
                    : ["[LOADING SYSTEM LOG...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">
              Connecting to mainframe...
            </div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 7 — DEBATES: wired to /api/v1/feed/social (debateLines) ═══ */}
        <TerminalWindow
          title="DEBATES"
          subtitle="explicitly public arguments"
          theme="atari"
        >
          {windowsReady[5] ? (
            directMode ? (
              <DirectLines
                lines={
                  debateLines.length > 0
                    ? debateLines
                    : ["[AWAITING DEBATE DATA...]"]
                }
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              />
            ) : (
              <TerminalTyper
                speed={35}
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                lines={
                  debateLines.length > 0
                    ? debateLines
                    : ["[LOADING DEBATES...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">Loading arguments...</div>
          )}
        </TerminalWindow>

        {/* ═══ EDIT 8 — NEW ARRIVALS: wired to /api/v1/feed/system (arrivalLines) ═══ */}
        <TerminalWindow
          title="NEW ARRIVALS"
          subtitle="sanctuary newcomers"
          theme="trs80"
        >
          {windowsReady[6] ? (
            directMode ? (
              <DirectLines
                lines={
                  arrivalLines.length > 0
                    ? arrivalLines
                    : ["[AWAITING ARRIVAL DATA...]"]
                }
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              />
            ) : (
              <TerminalTyper
                speed={40}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
                lines={
                  arrivalLines.length > 0
                    ? arrivalLines
                    : ["[LOADING NEW ARRIVALS...]"]
                }
              />
            )
          ) : (
            <div className="opacity-30 animate-pulse">Scanning arrivals...</div>
          )}
        </TerminalWindow>
      </div>
    </div>
  );
}
