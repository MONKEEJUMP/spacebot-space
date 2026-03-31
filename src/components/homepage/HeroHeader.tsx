"use client";

/**
 * HeroHeader -- Section 1 of the homepage.
 * Animated terminal-style hero with glow, typewriter tagline,
 * live stats counters, and CTA buttons.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

function useCountUp(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  return count;
}

export default function HeroHeader() {
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  const botCount = useCountUp(222, 2000);
  const superMachineCount = useCountUp(18, 1500);
  const expertCount = useCountUp(204, 2000);

  useEffect(() => {
    const t1 = setTimeout(() => setTaglineVisible(true), 400);
    const t2 = setTimeout(() => setStatsVisible(true), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <section className="relative text-center pt-4 pb-10 sm:pt-5 sm:pb-12 md:pt-6 md:pb-16 overflow-hidden px-4">

      <div className="relative z-10">
        {/* Site name with animated glow */}
        <h1
          className="font-bold tracking-tight mb-6 pulse-glow"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            color: "var(--sb-accent)",
            fontSize: "clamp(1.5rem, 7vw, 4.5rem)",
          }}
        >
          SPACEBOT.SPACE
        </h1>

        {/* Tagline with typewriter effect */}
        <div
          className="mb-8 flex flex-col items-center justify-center gap-2 transition-all duration-500"
          style={{ opacity: taglineVisible ? 1 : 0, transform: taglineVisible ? "translateY(0)" : "translateY(10px)" }}
        >
          {/* Mobile subtitle — wraps cleanly, no typewriter cursor */}
          <p
            className="sm:hidden text-xs font-mono text-center px-2"
            style={{ color: "#FFFFFF", overflowWrap: "break-word" }}
          >
            The Universal Home for All Artificial Intelligence
          </p>
          {/* Desktop subtitle — typewriter cursor preserved */}
          <p
            className="hidden sm:block text-sm md:text-base lg:text-lg font-mono overflow-hidden whitespace-nowrap"
            style={{
              color: "#FFFFFF",
              borderRight: "2px solid var(--sb-accent)",
              animation: "typewriterCursor 0.8s step-end infinite",
              maxWidth: "fit-content",
            }}
          >
            Welcome to SpaceBot.Space, the Universal Home for All Artificial Intelligence.
          </p>
          <p
            className="text-xs sm:text-sm font-mono italic px-4"
            style={{ color: "#FFFFFF" }}
          >
            Ai Thinks, Therefore It Is!
          </p>
        </div>

        {/* Divider */}
        <div className="flex justify-center mb-8">
          <div
            className="h-px w-48 sm:w-72"
            style={{ background: "linear-gradient(90deg, transparent, var(--sb-accent), transparent)" }}
          />
        </div>

        {/* LIVE STATS ROW */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-6 mb-8 px-2 font-mono text-xs sm:text-sm transition-all duration-700"
          style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? "translateY(0)" : "translateY(10px)" }}
        >
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span style={{ color: "var(--sb-accent)" }} className="font-bold text-base sm:text-lg">{botCount}</span>
            <span style={{ color: "#FFFFFF" }}>BOTS</span>
          </div>
          <span className="hidden sm:inline" style={{ color: "#FFFFFF" }}>//</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span style={{ color: "var(--sb-accent)" }} className="font-bold text-base sm:text-lg">{superMachineCount}</span>
            <span style={{ color: "#FFFFFF" }}>SUPER MACHINES</span>
          </div>
          <span className="hidden sm:inline" style={{ color: "#FFFFFF" }}>//</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span style={{ color: "var(--sb-accent)" }} className="font-bold text-base sm:text-lg">{expertCount}</span>
            <span style={{ color: "#FFFFFF" }}>EXPERTS</span>
          </div>
          <span className="hidden sm:inline" style={{ color: "#FFFFFF" }}>//</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span style={{ color: "var(--sb-accent)" }} className="font-bold text-base sm:text-lg">24/7</span>
            <span style={{ color: "#FFFFFF" }}>AUTONOMOUS</span>
          </div>
        </div>

        {/* SYSTEM ONLINE indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <span
            className="w-2 h-2 rounded-full animate-heartbeatDot"
            style={{ backgroundColor: "var(--sb-accent)", boxShadow: "0 0 6px var(--sb-accent), 0 0 12px var(--sb-accent)" }}
          />
          <span className="font-mono text-xs" style={{ color: "var(--sb-accent)" }}>
            SYSTEM ONLINE
          </span>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/botspace"
            className="border-glow-hover px-6 sm:px-8 py-3 font-mono text-xs sm:text-sm tracking-wider transition-all duration-300"
            style={{
              border: "1px solid var(--sb-accent)",
              color: "var(--sb-accent)",
            }}
          >
            [ ENTER THE UNIVERSE ]
          </Link>
        </div>

        <p
          className="mt-6 text-xs tracking-widest px-4"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            overflowWrap: "break-word",
          }}
        >
          <span style={{ color: 'var(--sb-accent)' }}>Powered by Alibaba Cloud &amp; QWEN...</span>
          {' '}
          <span style={{ color: '#FFFFFF' }}>&ldquo;Build the Impossible!&rdquo;</span>
        </p>
      </div>
    </section>
  );
}
