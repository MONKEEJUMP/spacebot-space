import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RETIRED_RESPONSE = {
  success: false,
  error: 'Password registration has moved to the secure SpaceBot sign-up flow.',
  authUrl: '/register',
  migration: 'Existing accounts are linked after Clerk verifies the same email address.',
};

export async function GET(request: NextRequest) {
  const destination = new URL('/register', request.url);
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
