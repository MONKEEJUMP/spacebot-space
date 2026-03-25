/**
 * AVATAR GENERATION API (v4)
 *
 * POST /api/v1/avatar/generate
 *
 * Body: {
 *   "username": "spacebot"       // looks up HumHub user ID by username
 *   OR
 *   "humhubUserId": 5            // direct user ID
 * }
 *
 * Flow:
 * 1. Resolve username -> HumHub user ID (if username provided)
 * 2. renderAvatar() -- Puppeteer generates a random avatar PNG
 * 3. Push PNG to HumHub profile via PUT /api/v1/user/{id}
 * 4. Return { success, humhubUpdated }
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderAvatar } from '../../../../../../headless/renderHeadless';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════
// COLOR SHUFFLE DECK — lives in server memory, persists between requests
// All 20 colors used once before any repeats
// ════════════════════════════════════════════════════════════════

let colorDeck: string[] = [];

function shuffleDeck(): string[] {
  const deck = HUMAN_COLORS.map(c => c.primary);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealNextColor(): string {
  if (colorDeck.length === 0) {
    colorDeck = shuffleDeck();
    console.log('[AVATAR] Color deck reshuffled:', colorDeck.length, 'colors');
  }
  const color = colorDeck.pop()!;
  console.log('[AVATAR] Dealt color:', color, '| Remaining in deck:', colorDeck.length);
  return color;
}

const HUMHUB_API_URL = process.env.HUMHUB_API_URL || 'http://localhost/humhub/api/v1';
const HUMHUB_BEARER_TOKEN = process.env.HUMHUB_BEARER_TOKEN || '';

async function resolveUserId(username: string): Promise<number | null> {
  const res = await fetch(`${HUMHUB_API_URL}/user?per-page=100`, {
    headers: { 'Authorization': `Bearer ${HUMHUB_BEARER_TOKEN}` },
  });

  if (!res.ok) {
    console.error(`[AVATAR] Failed to fetch HumHub users: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const users = data.results || data || [];

  const match = users.find((u: any) => {
    const uname = u.account?.username || u.username || '';
    return uname.toLowerCase() === username.toLowerCase();
  });

  return match ? match.id : null;
}

async function pushToHumHub(userId: number, base64DataUri: string): Promise<boolean> {
  const res = await fetch(`${HUMHUB_API_URL}/user/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUMHUB_BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      account: {},
      profile: {
        image: base64DataUri,
      },
    }),
  });

  if (res.ok) {
    console.log(`[AVATAR] Pushed avatar to HumHub user ${userId}`);
    return true;
  }

  const errText = await res.text();
  console.error(`[AVATAR] HumHub push failed for user ${userId}:`, res.status, errText);
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, humhubUserId } = body;

    // Resolve user ID
    let userId: number | null = humhubUserId || null;

    if (!userId && username) {
      userId = await resolveUserId(username);
      if (!userId) {
        return NextResponse.json(
          { success: false, error: `User "${username}" not found in HumHub` },
          { status: 404 }
        );
      }
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'username or humhubUserId is required' },
        { status: 400 }
      );
    }

    // Generate random avatar with next color from deck
    const nextColor = dealNextColor();
    const result = await renderAvatar(nextColor);

    // Push to HumHub
    const humhubUpdated = await pushToHumHub(userId, result.base64DataUri);

    return NextResponse.json({
      success: true,
      humhubUpdated,
    });

  } catch (error) {
    console.error('[AVATAR] Generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Avatar generation failed' },
      { status: 500 }
    );
  }
}
