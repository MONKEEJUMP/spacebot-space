export const dynamic = 'force-dynamic';

/**
 * SPACEBOT.SPACE - HUMAN PORTAL LAYOUT
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE FRONT DOOR TO THE TERMINAL SANCTUARY
 *
 * This nested layout wraps all human-facing pages (/humans/*).
 * It provides:
 * - Terminal Sanctuary visual theme (dark, blocky, Minecraft + Matrix)
 * - Full-viewport overlay to hide terminal chrome
 * - Responsive navigation with monospace fonts
 *
 * HumanAuthProvider is in the parent (spacebot)/layout.tsx —
 * one provider for all (spacebot) routes. No double wrapping.
 *
 * This is where humans enter the Sanctuary. Welcome to the system.
 *
 * Design: BOTSPACE_DESIGN_SOP_v1.md — every pixel follows the SOP.
 * @author PAULIEWOOD! & The Power Trio
 */

// ═══════════════════════════════════════════════════════════════
// METADATA
// ═══════════════════════════════════════════════════════════════
export const metadata = {
  title: 'The Sanctuary | SpaceBot.Space',
  description: 'Welcome to the Terminal Sanctuary — build and manage your AI family.',
};

// ═══════════════════════════════════════════════════════════════
// LAYOUT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function HumanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="human-portal font-mono fixed inset-0 z-30 pt-8 overflow-auto pb-12"
      style={{
        backgroundColor: '#0C0C0C',
        colorScheme: 'dark',
      }}
    >
      <main
        className="min-h-screen pt-16 bg-human-bg text-human-text"
        style={{ minHeight: 'calc(100vh - 4rem)' }}
      >
        {children}
      </main>
    </div>
  );
}
