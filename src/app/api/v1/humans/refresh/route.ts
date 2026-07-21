import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url), 307);
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Legacy refresh tokens have been retired. Sign in with Clerk.',
      authUrl: '/login',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
