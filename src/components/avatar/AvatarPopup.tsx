'use client';

import { useRef, useEffect } from 'react';
import type { RobotConfig, FactionPalette } from './avatarConfig';
import { seededRandom, generateConfig, getColors } from './avatarSeeder';
import { drawRobot } from './avatarRenderer';
import { drawHumanAccessories } from './avatarHumanAccessories';
import { drawBotAccessories } from './avatarBotAccessories';
import { drawSharedAccessories } from './avatarSharedAccessories';

interface AvatarPopupProps {
  seed: string;
  isBot?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * AvatarPopup — 1600x1600 full-size avatar modal
 * Click any avatar to see it in full detail.
 */
export default function AvatarPopup({ seed, isBot = true, isOpen, onClose }: AvatarPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SIZE = 1600;

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;

    const rng = seededRandom(seed);
    const config = generateConfig(rng, undefined, isBot);
    const colors = getColors(undefined, isBot, seededRandom(seed + ':color'));

    drawRobot(ctx, config, colors, SIZE);

    if (isBot) {
      drawBotAccessories(ctx, config, colors, SIZE);
    } else {
      if (config.humanAccessories && config.humanAccessories.length > 0) {
        drawHumanAccessories(ctx, config, colors, SIZE);
      }
    }
    drawSharedAccessories(ctx, config, colors, SIZE);
  }, [seed, isBot, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: -40,
            right: 0,
            background: 'none',
            border: '1px solid #555',
            color: '#CCCCCC',
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'monospace',
            letterSpacing: 2,
          }}
        >
          CLOSE
        </button>

        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'block',
            border: '2px solid #333',
          }}
        />
      </div>
    </div>
  );
}
