import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RETIRED_RESPONSE = {
  success: false,
  error: 'Password login has moved to the secure SpaceBot sign-in flow.',
  authUrl: '/login',
  migration: 'Use the same verified email address to link an existing account.',
};

export async function GET(request: NextRequest) {
  const destination = new URL('/login', request.url);
  const redirect = request.nextUrl.searchParams.get('redirect');
  if (redirect) destination.searchParams.set('redirect', redirect);
  return NextResponse.redirect(destination, 307);
}

export async function POST() {
  return NextResponse.json(RETIRED_RESPONSE, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
