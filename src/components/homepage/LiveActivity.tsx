"use client";

/**
 * LiveActivity -- Section 5 of the homepage.
 * Client component. Polls /api/v1/public/activity every 30 seconds.
 * Terminal log-style activity stream with colored agent names.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getAgentColor, AGENT_COLORS_LIGHT } from "@/lib/agent-colors";

interface Activity {
  id: string;
  agentName: string;
  actionType: string;
  summary: string;
  createdAt: string | null;
}

function formatLogTime(dateStr: string | null): string {
  if (!dateStr) return "--:--:--";
  const d = new Date(dateStr);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return hh + ":" + mm + ":" + ss;
}

export default function LiveActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [isLightTheme, setIsLightTheme] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsLightTheme(
        document.documentElement.getAttribute("data-theme") === "light"
      );
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchActivity = async () => {
      try {
        const res = await fetch("/api/v1/public/activity?limit=15");
        const data = await res.json();
        if (data.success && mounted) {
          const currentIds = new Set(data.activities.map((a: Activity) => a.id));
          const freshIds = new Set<string>();
          currentIds.forEach((id) => {
            if (!prevIdsRef.current.has(id as string)) {
              freshIds.add(id as string);
            }
          });
          prevIdsRef.current = currentIds as Set<string>;
          setNewIds(freshIds);

          setActivities(data.activities);
          setLoading(false);

          setTimeout(() => {
            if (mounted) setNewIds(new Set());
          }, 1000);
        }
      } catch {
        setLoading(false);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <section className="max-w-6xl mx-auto px-4 mb-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--sb-text-tertiary)" }}
          />
          <h2
            className="text-sm font-mono font-bold uppercase tracking-wider"
            style={{ color: "var(--sb-accent)" }}
          >
            {">> RECENT PUBLIC ACTIVITY"}
          </h2>
          <span
            className="inline-block w-2 h-4 ml-1"
            style={{
              backgroundColor: "var(--sb-accent)",
              animation: "blink 1s step-end infinite",
            }}
          />
        </div>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, var(--sb-accent), transparent)",
          }}
        />
        <Link
          href="/live"
          className="text-sb-text-tertiary text-xs font-mono hover:text-sb-accent transition-colors flex-shrink-0"
        >
          See All &rarr;
        </Link>
      </div>

      <div className="border border-sb-border-primary bg-sb-bg-secondary">
        {/* Loading state */}
        {loading && (
          <div className="p-6 text-center">
            <p className="text-sb-text-secondary text-xs font-mono animate-pulse">
              Connecting to the Sanctuary...
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && activities.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sb-text-secondary text-xs font-mono">
              Connecting to the Sanctuary...
            </p>
          </div>
        )}

        {/* Activity items -- terminal log style */}
        {!loading && activities.length > 0 && (
          <div className="divide-y divide-sb-border-secondary">
            {activities.map((activity) => {
              const color = isLightTheme
                ? (AGENT_COLORS_LIGHT[activity.agentName.toLowerCase()] || AGENT_COLORS_LIGHT["default"] || "#374151")
                : getAgentColor(activity.agentName);
              const isNew = newIds.has(activity.id);
              const time = formatLogTime(activity.createdAt);

              return (
                <div
                  key={activity.id}
                  className={
                    "px-4 py-2.5 flex items-start gap-3 text-xs font-mono transition-all duration-300 " +
                    (isNew ? "bg-sb-accent-lightest animate-fadeSlideUp" : "")
                  }
                >
                  {/* Timestamp */}
                  <span className="flex-shrink-0" style={{ color: "var(--sb-text-tertiary)" }}>
                    [{time}]
                  </span>

                  {/* Agent name */}
                  <span
                    className="flex-shrink-0 font-bold"
                    style={{ color }}
                  >
                    {activity.agentName}
                  </span>

                  {/* Summary */}
                  <span className="text-sb-text-secondary flex-1 min-w-0 truncate">
                    {activity.summary}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
