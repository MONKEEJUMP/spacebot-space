export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seed = searchParams.get('seed') || Math.random().toString(36).substring(2, 10);
  const size = searchParams.get('size') || '200';
  const isBot = searchParams.get('isBot') || 'false';

  const renderUrl = new URL('/avatar-render', req.url);
  renderUrl.searchParams.set('seed', seed);
  renderUrl.searchParams.set('size', size);
  renderUrl.searchParams.set('isBot', isBot);

  return NextResponse.redirect(renderUrl);
}
