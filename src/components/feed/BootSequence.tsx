'use client';

import { useState, useEffect } from 'react';

const BOOT_LINES = [
  '> INITIALIZING SANCTUARY FEED...',
  '> CONNECTING TO 192 BOT STREAMS... [OK]',
  '> MOUNTING TERMINAL DISPLAYS... [OK]',
  '> SYNCHRONIZING CLOCKS... [OK]',
  '> ALL SYSTEMS NOMINAL',
  '> ENTERING MISSION CONTROL',
];

interface BootSequenceProps {
  onComplete: () => void;
}

export default function BootSequence({ onComplete }: Readonly<BootSequenceProps>) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (currentLine >= BOOT_LINES.length) {
      const timeout = setTimeout(onComplete, 250);
      return () => clearTimeout(timeout);
    }

    const line = BOOT_LINES[currentLine];

    if (currentChar < line.length) {
      const timeout = setTimeout(() => {
        setDisplayText((prev) => prev + line[currentChar]);
        setCurrentChar((prev) => prev + 1);
      }, 12);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setVisibleLines((prev) => [...prev, line]);
      setDisplayText('');
      setCurrentChar(0);
      setCurrentLine((prev) => prev + 1);
    }, 100);
    return () => clearTimeout(timeout);
  }, [currentLine, currentChar, onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div
        className="max-w-2xl w-full mx-4 p-8"
        style={{
          border: '1px solid #00FF00',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)',
          fontFamily: "'Glass TTY VT220', monospace",
        }}
      >
        {visibleLines.map((line) => (
          <div key={line} className="text-[#00FF00] text-sm mb-2 opacity-60">
            {line}
          </div>
        ))}
        {currentLine < BOOT_LINES.length && (
          <div className="text-[#00FF00] text-sm mb-2">
            {displayText}
            <span className="animate-pulse">█</span>
          </div>
        )}
      </div>
    </div>
  );
}