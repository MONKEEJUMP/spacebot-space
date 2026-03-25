'use client';

interface TerminalWindowProps {
  title: string;
  subtitle?: string;
  theme: 'ibm-plasma' | 'apple-ii' | 'bsod' | 'c64' | 'vt220' | 'matrix' | 'atari' | 'trs80';
  children: React.ReactNode;
}

const THEMES = {
  'ibm-plasma': {
    bg: '#1a0a00',
    text: '#FF8C00',
    border: '#FF6600',
    headerBg: '#FF660033',
    headerText: '#FF8C00',
    font: "'VT323', monospace",
    glow: '0 0 8px rgba(255, 102, 0, 0.3)',
    scanlines: false,
  },
  'apple-ii': {
    bg: '#001100',
    text: '#33FF33',
    border: '#00CC00',
    headerBg: '#00CC0033',
    headerText: '#33FF33',
    font: "'Share Tech Mono', monospace",
    glow: '0 0 8px rgba(0, 204, 0, 0.3)',
    scanlines: true,
  },
  bsod: {
    bg: '#0000AA',
    text: '#FFFFFF',
    border: '#0000CC',
    headerBg: '#0000CC',
    headerText: '#FFFFFF',
    font: "'Courier New', monospace",
    glow: 'none',
    scanlines: false,
  },
  c64: {
    bg: '#40318D',
    text: '#7B71D5',
    border: '#7B71D5',
    headerBg: '#7B71D544',
    headerText: '#6FE2FF',
    font: "'VT323', monospace",
    glow: '0 0 8px rgba(111, 226, 255, 0.2)',
    scanlines: false,
  },
  vt220: {
    bg: '#0a0a0a',
    text: '#CCCCCC',
    border: '#444444',
    headerBg: '#44444444',
    headerText: '#FFFFFF',
    font: "'Glass TTY VT220', monospace",
    glow: 'none',
    scanlines: false,
  },
  matrix: {
    bg: '#000000',
    text: '#00FF41',
    border: '#00FF41',
    headerBg: '#00FF4122',
    headerText: '#00FF41',
    font: "'Fira Code', monospace",
    glow: '0 0 12px rgba(0, 255, 65, 0.3)',
    scanlines: false,
  },
  atari: {
    bg: '#1a1200',
    text: '#D4A017',
    border: '#B8860B',
    headerBg: '#B8860B33',
    headerText: '#D4A017',
    font: "'VT323', monospace",
    glow: '0 0 8px rgba(212, 160, 23, 0.3)',
    scanlines: false,
  },
  trs80: {
    bg: '#0a0a0a',
    text: '#C0C0C0',
    border: '#808080',
    headerBg: '#80808033',
    headerText: '#FFFFFF',
    font: "'Share Tech Mono', monospace",
    glow: 'none',
    scanlines: true,
  },
};

export default function TerminalWindow({ title, subtitle, theme, children }: TerminalWindowProps) {
  const t = THEMES[theme];

  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        backgroundColor: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: t.glow,
        fontFamily: t.font,
        height: '250px',
      }}
    >
      <div
        className="px-3 py-2 text-xs tracking-widest font-bold flex justify-between items-center"
        style={{
          backgroundColor: t.headerBg,
          color: t.headerText,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <span>{title}</span>
        {subtitle && <span className="text-xs opacity-60">{subtitle}</span>}
      </div>

      <div
        className="flex-1 overflow-y-auto p-3 text-sm leading-relaxed"
        style={{ color: t.text }}
      >
        {children}
      </div>

      {t.scanlines && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
          }}
        />
      )}
    </div>
  );
}