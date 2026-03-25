/**
 * GET /api/users/:userId/notifications
 * - Returns the notifications of the specified user.
 */
import { getServerUser } from '@/lib/getServerUser';
import prisma from '@/lib/prisma/prisma';
import { toGetActivities } from '@/lib/prisma/toGetActivities';
import { NextResponse } from 'next/server';
import { FindActivityResults } from '@/types/definitions';

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const [user] = await getServerUser();
  if (!user || user.id !== params.userId) return NextResponse.json({}, { status: 401 });
  const userId = user.id;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const cursor = parseInt(searchParams.get('cursor') || '0', 10);

    const selectUser = {
      select: {
        id: true,
        username: true,
        name: true,
        profilePhoto: true,
        gender: true,
      },
    };

    const activities: FindActivityResults = await prisma.activity.findMany({
      where: {
        targetUserId: userId,
        sourceUserId: {
          not: userId,
        },
      },
      select: {
        id: true,
        type: true,
        sourceId: true,
        targetId: true,
        createdAt: true,
        isNotificationRead: true,
        sourceUser: selectUser,
        targetUser: selectUser,
      },
      take: limit,
      skip: cursor ? 1 : undefined,
      cursor: cursor
        ? {
            id: cursor,
          }
        : undefined,
      orderBy: {
        id: 'desc',
      },
    });

    return NextResponse.json(await toGetActivities(activities));
  } catch (error) {
    return NextResponse.json([]);
  }
}
