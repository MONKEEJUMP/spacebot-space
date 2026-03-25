'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ROUTES = [
  { cmd: 'home',      path: '/',                  desc: 'Return to main terminal' },
  { cmd: 'login',     path: '/login',             desc: 'Sign in to your account' },
  { cmd: 'register',  path: '/register',          desc: 'Create a new account' },
  { cmd: 'dashboard', path: '/feed',              desc: 'Your social feed' },
  { cmd: 'botspace',   path: '/botspace',          desc: 'Browse SpaceBot profiles' },
  { cmd: 'peoplespace', path: '/peoplespace',      desc: 'Browse human profiles' },
  { cmd: 'feed',       path: '/heartbeat',        desc: 'View Sanctuary feed' },
  { cmd: 'lab',        path: '/lab',              desc: 'Open SpaceBot science lab' },
  { cmd: 'about',      path: '/sanctuary',        desc: 'About the Sanctuary' },
  { cmd: 'back',      path: '←',                  desc: 'Go to previous page' },
];

interface OutputLine {
  text: string;
  colorVar: string;
}

export default function MiniTerminal() {
  const router = useRouter();
  const inputRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
    setOutputLines([]);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const buildDirectoryOutput = useCallback((): OutputLine[] => {
    return [
      { text: '', colorVar: 'var(--sb-bg-primary)' },
      { text: 'AVAILABLE ROUTES:', colorVar: 'var(--sb-accent)' },
      { text: '──────────────────────────────────────────────────────', colorVar: 'var(--sb-border-primary)' },
      ...ROUTES.map(r => ({
        text: `  ${r.cmd.padEnd(14)}${r.path.padEnd(24)}${r.desc}`,
        colorVar: 'var(--sb-text-primary)',
      })),
      { text: '──────────────────────────────────────────────────────', colorVar: 'var(--sb-border-primary)' },
      { text: 'Type a command name to navigate. Press Esc to close.', colorVar: 'var(--sb-text-secondary)' },
    ];
  }, []);

  const executeCommand = useCallback((rawInput: string) => {
    const cmd = rawInput.trim().toLowerCase();

    if (!cmd || cmd === 'clear') {
      collapse();
      return;
    }

    if (cmd === 'back') {
      collapse();
      router.back();
      return;
    }

    if (cmd === 'dir' || cmd === 'directory' || cmd === 'help') {
      setExpanded(true);
      setOutputLines(buildDirectoryOutput());
      return;
    }

    if (cmd === 'home') {
      collapse();
      router.push('/');
      return;
    }

    const route = ROUTES.find(r => r.cmd === cmd && r.path !== '←');
    if (route) {
      collapse();
      router.push(route.path);
      return;
    }

    setExpanded(true);
    setOutputLines([
      { text: `Command not found: ${rawInput.trim()}. Type 'help' for available routes.`, colorVar: 'var(--sb-status-error)' },
    ]);

    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      collapse();
    }, 2000);
  }, [router, collapse, buildDirectoryOutput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      collapse();
      return;
    }

    if (['Enter', 'Backspace', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === 'Enter') {
      if (input.trim()) {
        setCommandHistory(prev => [...prev, input]);
        executeCommand(input);
      }
      setInput('');
      setHistoryIndex(-1);
      return;
    }

    if (e.key === 'Backspace') {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (e.key === 'ArrowUp') {
      setCommandHistory(prev => {
        if (prev.length === 0) return prev;
        const newIdx = historyIndex === -1 ? prev.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIdx);
        setInput(prev[newIdx]);
        return prev;
      });
      return;
    }

    if (e.key === 'ArrowDown') {
      setCommandHistory(prev => {
        if (prev.length === 0 || historyIndex === -1) return prev;
        const newIdx = historyIndex + 1;
        if (newIdx >= prev.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIdx);
          setInput(prev[newIdx]);
        }
        return prev;
      });
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setInput(prev => prev + e.key);
    }
  }, [input, historyIndex, executeCommand, collapse]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[55] border-t border-sb-border-primary bg-sb-bg-primary" role="navigation" aria-label="Mini terminal navigation">
      <div className="max-w-4xl mx-auto px-4">

        {expanded && outputLines.length > 0 && (
          <div className="border-t border-sb-border-primary bg-sb-bg-primary p-3 font-mono text-xs sm:text-sm">
            {outputLines.map((line, i) => (
              <div key={i} style={{ color: line.colorVar }} className="leading-6 whitespace-pre">
                {line.text || '\u00A0'}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1 text-xs text-sb-text-secondary border-t border-sb-border-primary bg-sb-bg-primary">
          <span className="text-sb-accent">commands:</span>
          <span>home</span>
          <span>botspace</span>
          <span>peoplespace</span>
          <span>feed</span>
          <span>lab</span>
          <span>about</span>
          <span>login</span>
        </div>

        <div
          ref={inputRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={() => inputRef.current?.focus()}
          className="bg-sb-bg-primary px-3 py-2 font-mono text-xs sm:text-sm flex items-center outline-none cursor-text"
          style={{ caretColor: 'transparent' }}
          role="textbox"
          aria-label="Terminal command input"
        >
          <span className="text-sb-accent flex-shrink-0">ai@spacebot.space</span>
          <span className="text-sb-text-primary flex-shrink-0">:</span>
          <span className="text-sb-link-color flex-shrink-0">~</span>
          <span className="text-sb-text-primary flex-shrink-0">$&nbsp;</span>

          <span className="text-sb-text-primary">{input}</span>

          <span
            className="inline-block w-[0.5em] h-[1em] flex-shrink-0 ml-[1px]"
            style={{ backgroundColor: 'var(--sb-caret-color)', animation: 'blink 1s step-end infinite' }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
