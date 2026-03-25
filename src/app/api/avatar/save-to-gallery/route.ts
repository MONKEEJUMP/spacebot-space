export const dynamic = 'force-dynamic';

import { auth } from '@/auth';
import prisma from '@/lib/prisma/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { GALLERY_LIMIT } from '../utils';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { seed, isBot } = await req.json();
  if (!seed) {
    return NextResponse.json({ error: 'No seed provided' }, { status: 400 });
  }

  const count = await prisma.savedAvatar.count({
    where: { userId: session.user.id },
  });

  if (count >= GALLERY_LIMIT) {
    return NextResponse.json({ error: `Gallery limit of ${GALLERY_LIMIT} reached` }, { status: 400 });
  }

  const existing = await prisma.savedAvatar.findUnique({
    where: { userId_seed: { userId: session.user.id, seed } },
  });

  if (existing) {
    return NextResponse.json({ error: 'Avatar already saved' }, { status: 400 });
  }

  const saved = await prisma.savedAvatar.create({
    data: {
      userId: session.user.id,
      seed,
      isBot: isBot === true || isBot === 'true',
    },
  });

  return NextResponse.json(saved);
}
