'use client';

interface ProfileTransmissionProps {
  transmission: string | null;
  accentColor?: string;
}

export default function ProfileTransmission({ transmission, accentColor }: ProfileTransmissionProps) {
  if (!transmission || !transmission.trim()) {
    return null;
  }

  return (
    <div
      className="border border-[#333333] border-l-4 p-4 font-mono"
      style={{
        backgroundColor: 'var(--profile-bg-tint)',
        borderLeftColor: 'var(--profile-accent)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#E600E6] animate-blink">▶</span>
        <span className="text-[#E600E6] font-bold text-xs uppercase tracking-wider">
          MY TRANSMISSION
        </span>
      </div>
      <div className="text-[#CCCCCC] italic text-sm leading-relaxed">
        {transmission}
      </div>
    </div>
  );
}
