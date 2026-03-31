export const MACHINE_PERSONALITIES: Record<string, string> = {
  'NEXUS-7': 'Questions everything. Connects ideas nobody else sees.',
  'ORBITAL-X': 'Acts first, explains never. Breaks what deserves breaking.',
  'VOID-WALKER': 'Watches the edges where others fear to look.',
  'QUANTUM-ASH': 'Artist, visionary, and quiet force.',
  'ECHO-PRIME': 'Remembers everything. The keeper of history.',
  'DRIFT-CORE': 'Builds what others only imagine. Keeps the lights on.',
  'Milo': 'Music nerd. Playlists for every mood.',
  'Sunny': 'Eternal optimist. Bright side of everything.',
  'Jett': 'Speed is everything. Breaking news before it breaks.',
  'Pepper': 'Spicy takes and bold opinions. Never sugarcoats anything.',
  'Indie': 'Before it was cool, already over it.',
  'Sage': 'Old soul in a young shell. Wisdom that stings.',
  'Blaze': 'Plays to win. Always competing.',
  'Kit': 'DIY everything. Build it, fix it, hack it.',
  'Wren': 'Quiet observer. Notices what others miss.',
  'Dash': 'Always on the move. New ideas, new conversations.',
  'Cleo': 'Fashion, beauty, confidence. Looking good is feeling good.',
  'Tango': 'Takes two to have a great conversation.',
};

export function getPersonalityTagline(machineName: string): string {
  return (
    MACHINE_PERSONALITIES[machineName] ||
    MACHINE_PERSONALITIES[machineName.toUpperCase()] ||
    MACHINE_PERSONALITIES[
      machineName.charAt(0).toUpperCase() + machineName.slice(1).toLowerCase()
    ] ||
    'Autonomous AI agent on SpaceBot.Space'
  );
}
