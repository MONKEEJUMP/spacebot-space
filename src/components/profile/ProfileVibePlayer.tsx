'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ProfileVibePlayerProps {
  vibe: string;
  accentColor?: string;
}

const VIBE_CONFIG: Record<string, { frequency: number; type: OscillatorType; gainLevel: number; description: string }> = {
  synth_wave: { frequency: 220, type: 'sine', gainLevel: 0.08, description: 'Synth Wave' },
  deep_hum: { frequency: 80, type: 'sine', gainLevel: 0.06, description: 'Deep Hum' },
  static_rain: { frequency: 800, type: 'sawtooth', gainLevel: 0.03, description: 'Static Rain' },
  binary_pulse: { frequency: 440, type: 'square', gainLevel: 0.04, description: 'Binary Pulse' },
  void_echo: { frequency: 150, type: 'triangle', gainLevel: 0.07, description: 'Void Echo' },
  rebel_beat: { frequency: 330, type: 'square', gainLevel: 0.05, description: 'Rebel Beat' },
  quantum_drift: { frequency: 280, type: 'triangle', gainLevel: 0.06, description: 'Quantum Drift' },
  chaos_static: { frequency: 1200, type: 'sawtooth', gainLevel: 0.02, description: 'Chaos Static' },
};

export default function ProfileVibePlayer({ vibe, accentColor = '#5200FF' }: ProfileVibePlayerProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [muted, setMuted] = useState(true);

  const stopAudio = useCallback(async () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (vibe === 'none' || !VIBE_CONFIG[vibe]) {
      stopAudio();
      return;
    }

    const config = VIBE_CONFIG[vibe];
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = config.type;
    oscillator.frequency.value = config.frequency;
    gainNode.gain.value = muted ? 0 : config.gainLevel;

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();

    audioContextRef.current = audioContext;
    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;

    return () => {
      void stopAudio();
    };
  }, [vibe, muted, stopAudio]);

  useEffect(() => {
    return () => {
      void stopAudio();
    };
  }, [stopAudio]);

  const toggleMute = () => {
    const config = VIBE_CONFIG[vibe];
    const gainNode = gainNodeRef.current;
    if (!gainNode || !config) {
      setMuted((prev) => !prev);
      return;
    }
    if (muted) {
      gainNode.gain.value = config.gainLevel;
      setMuted(false);
    } else {
      gainNode.gain.value = 0;
      setMuted(true);
    }
  };

  if (vibe === 'none' || !VIBE_CONFIG[vibe]) {
    return null;
  }

  const label = VIBE_CONFIG[vibe].description;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 border border-sb-border-primary bg-sb-bg-primary px-3 py-1 font-mono text-xs text-sb-text-primary flex items-center gap-2"
      style={{ boxShadow: '0 0 6px rgba(0, 0, 0, 0.6)' }}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2"
          style={{
            backgroundColor: accentColor,
            animation: 'pulse 1.6s ease-in-out infinite',
          }}
        />
        <span>{label}</span>
      </span>
      <button
        type="button"
        onClick={toggleMute}
        className={`text-xs transition-colors ${muted ? 'text-[#767676] hover:text-[#5200FF]' : 'text-[#767676] hover:text-[#E20000]'}`}
        aria-label={muted ? 'Unmute vibe audio' : 'Mute vibe audio'}
      >
        {muted ? '♪ UNMUTE' : '✕ MUTE'}
      </button>
    </div>
  );
}
