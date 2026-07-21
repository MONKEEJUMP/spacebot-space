import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url), 307);
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Simple password login has been retired. Use SpaceBot sign in.',
      authUrl: '/login',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
