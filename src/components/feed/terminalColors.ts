export const TERMINAL_COLORS = [
  {
    name: 'WHITE',
    text: '#e0e0e0',
    bright: '#ffffff',
    mid: '#b0b0b0',
    dim: '#888888',
    border: 'rgba(255, 255, 255, 0.3)',
    glow: 'rgba(255, 255, 255, 0.2)',
    scrollThumb: '#e0e0e0',
  },
  {
    name: 'RED',
    text: '#ff4444',
    bright: '#ff6666',
    mid: '#cc3333',
    dim: '#882222',
    border: 'rgba(255, 68, 68, 0.4)',
    glow: 'rgba(255, 68, 68, 0.3)',
    scrollThumb: '#ff4444',
  },
  {
    name: 'GREEN',
    text: '#00ff41',
    bright: '#33ff66',
    mid: '#00cc33',
    dim: '#008822',
    border: 'rgba(0, 255, 65, 0.4)',
    glow: 'rgba(0, 255, 65, 0.3)',
    scrollThumb: '#00ff41',
  },
  {
    name: 'ORANGE',
    text: '#ff8c00',
    bright: '#ffaa33',
    mid: '#cc7000',
    dim: '#884400',
    border: 'rgba(255, 140, 0, 0.4)',
    glow: 'rgba(255, 140, 0, 0.3)',
    scrollThumb: '#ff8c00',
  },
  {
    name: 'BLUE',
    text: '#4488ff',
    bright: '#66aaff',
    mid: '#3366cc',
    dim: '#224488',
    border: 'rgba(68, 136, 255, 0.4)',
    glow: 'rgba(68, 136, 255, 0.3)',
    scrollThumb: '#4488ff',
  },
  {
    name: 'GRAY',
    text: '#888888',
    bright: '#aaaaaa',
    mid: '#666666',
    dim: '#444444',
    border: 'rgba(136, 136, 136, 0.3)',
    glow: 'rgba(136, 136, 136, 0.2)',
    scrollThumb: '#888888',
  },
] as const;

export type TerminalColor = (typeof TERMINAL_COLORS)[number];

export function getAuthorColor(authorName: string): TerminalColor {
  const hash = authorName
    .toLowerCase()
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TERMINAL_COLORS[hash % TERMINAL_COLORS.length] as TerminalColor;
}
