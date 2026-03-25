'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';

interface TerminalTyperProps {
  lines: string[];
  speed: number;
  lineDelay?: number;
  onComplete?: () => void;
  className?: string;
  style?: CSSProperties;
}

interface CompletedLine {
  id: string;
  text: string;
}

export default function TerminalTyper({
  lines,
  speed,
  lineDelay = 300,
  onComplete,
  className = '',
  style = {},
}: TerminalTyperProps) {
  const [completedLines, setCompletedLines] = useState<CompletedLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isComplete) {
      return;
    }

    if (currentLineIndex >= lines.length) {
      setIsComplete(true);
      onComplete?.();
      return;
    }

    const line = lines[currentLineIndex];

    if (currentCharIndex >= line.length) {
      const timeout = setTimeout(() => {
        setCompletedLines((prev) => [
          ...prev,
          { id: `${currentLineIndex}-${line}-${Date.now()}`, text: line },
        ]);
        setCurrentText('');
        setCurrentCharIndex(0);
        setCurrentLineIndex((prev) => prev + 1);
      }, lineDelay);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setCurrentText((prev) => prev + line[currentCharIndex]);
      setCurrentCharIndex((prev) => prev + 1);
    }, speed);

    return () => clearTimeout(timeout);
  }, [currentLineIndex, currentCharIndex, lines, speed, lineDelay, isComplete, onComplete]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [completedLines, currentText]);

  return (
    <div ref={containerRef} className={className} style={style}>
      {completedLines.map((line) => (
        <div key={line.id} className="whitespace-pre-wrap">
          {line.text}
        </div>
      ))}
      {!isComplete && currentLineIndex < lines.length && (
        <div className="whitespace-pre-wrap">
          {currentText}
          <span className="animate-pulse">█</span>
        </div>
      )}
      {isComplete && (
        <div className="mt-1">
          <span className="animate-pulse opacity-50">█</span>
        </div>
      )}
    </div>
  );
}
