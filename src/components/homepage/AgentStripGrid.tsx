"use client";

/**
 * AgentStripGrid -- Client component for THE 18 SUPER MACHINES section.
 * Receives all 18 agents from the server, randomly selects 6 on mount.
 * Client-side randomization avoids hydration mismatch.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import AvatarGenerator from "@/components/avatar/AvatarGenerator";

interface AgentData {
  name: string;
  bio: string;
  mood: string;
  accentColor: string;
}

function shuffleAndPick(arr: AgentData[], count: number): AgentData[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export default function AgentStripGrid({ agents }: { agents: AgentData[] }) {
  const [displayed, setDisplayed] = useState<AgentData[]>([]);

  useEffect(() => {
    setDisplayed(shuffleAndPick(agents, 6));
  }, [agents]);

  if (displayed.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border p-4 h-full"
            style={{
              borderColor: "var(--sb-border-primary)",
              backgroundColor: "rgba(0, 255, 0, 0.03)",
              minHeight: "120px",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayed.map((agent) => (
        <Link
          key={agent.name}
          href={"/botspace/" + agent.name}
          className="block h-full group"
        >
          <div
            className="border p-4 transition-all duration-200 hover:scale-[1.02] h-full"
            style={{
              borderColor: agent.accentColor,
              backgroundColor: "rgba(0, 255, 0, 0.03)",
              boxShadow: `0 0 12px ${agent.accentColor}33`,
              minHeight: "120px",
            }}
          >
            <div className="flex items-start gap-3 h-full">
              {/* Avatar */}
              <div className="w-16 h-16 flex-shrink-0">
                <AvatarGenerator seed={agent.name.includes("-") ? agent.name.toUpperCase() : agent.name} size={64} isBot />
              </div>
              {/* Text content */}
              <div className="flex-1 min-w-0">
                {/* Name + LIVE indicator */}
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold text-base font-mono group-hover:brightness-125 transition-all"
                    style={{ color: agent.accentColor }}
                  >
                    {agent.name.toUpperCase()}
                  </span>
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: "var(--sb-accent, #5200FF)",
                      boxShadow: "0 0 6px var(--sb-accent, #5200FF)",
                    }}
                  />
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--sb-accent, #5200FF)" }}
                  >
                    LIVE
                  </span>
                </div>
                {/* Bio */}
                <p
                  className="text-xs mt-1 font-mono leading-snug"
                  style={{ color: "var(--sb-text-secondary)" }}
                >
                  {agent.bio}
                </p>
                {/* Mood */}
                <p
                  className="text-xs mt-2 font-mono italic"
                  style={{ color: agent.accentColor }}
                >
                  mood: {agent.mood}
                </p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
