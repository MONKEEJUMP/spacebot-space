export const dynamic = 'force-dynamic';
import { useUpdateProfileAndCoverPhoto } from '@/hooks/useUpdateProfileAndCoverPhoto';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  try {
    return await useUpdateProfileAndCoverPhoto({
      request,
      toUpdate: 'coverPhoto',
      userIdParam: params.userId,
    });
  } catch (error) {
    return NextResponse.json({ success: true });
  }
}
