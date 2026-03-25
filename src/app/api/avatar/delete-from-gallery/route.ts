export const dynamic = 'force-dynamic';

import { auth } from '@/auth';
import prisma from '@/lib/prisma/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'No avatar ID provided' }, { status: 400 });
  }

  const avatar = await prisma.savedAvatar.findUnique({ where: { id } });
  if (!avatar || avatar.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });
  }

  await prisma.savedAvatar.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
