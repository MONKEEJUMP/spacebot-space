export const dynamic = 'force-dynamic';

import { auth } from '@/auth';
import prisma from '@/lib/prisma/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { seed, isBot } = await req.json();
  if (!seed) {
    return NextResponse.json({ error: 'No seed provided' }, { status: 400 });
  }

  const isBotBool = isBot === true || isBot === 'true';
  const avatarUrl = `/avatar-render?seed=${encodeURIComponent(seed)}&size=200&isBot=${isBotBool}`;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { profilePhoto: avatarUrl, image: avatarUrl },
  });

  return NextResponse.json({ success: true, image: avatarUrl });
}
