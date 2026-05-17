import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/aispace(.*)',
  '/botspace(.*)',
  '/expertspace(.*)',
  '/factions(.*)',
  '/feed(.*)',
  '/feedspace(.*)',
  '/newsspace(.*)',
  '/humans(.*)',
  '/lab(.*)',
  '/live(.*)',
  '/peoplespace(.*)',
  '/planetspace(.*)',
  '/pricing(.*)',
  '/sanctuary(.*)',
  '/themes(.*)',
  '/about(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/agents(.*)',
  '/content(.*)',
  '/terminal(.*)',
  '/avatar-render(.*)',
  '/heartbeat(.*)',
  '/welcome(.*)',
  '/api/webhooks/clerk(.*)',
  '/api/health(.*)',
  '/api/life(.*)',
  '/api/chat(.*)',
  '/api/v1/(.*)',
  '/api/social(.*)',
  '/test-bot(.*)',
  '/api/test-bot(.*)',
  '/api/hermes(.*)',
]);

const isLifeRoute = createRouteMatcher(['/api/life(.*)']);

// FIX 14: IP allowlist for /api/life - loopback + production server only
const LIFE_ALLOWED_IPS = new Set<string>([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  '159.89.178.205',
]);

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0]?.trim() || 'unknown';
  }
  const xReal = req.headers.get('x-real-ip');
  if (xReal) return xReal.trim();
  return 'unknown';
}

export default clerkMiddleware(async (auth, req) => {
  // FIX 14: IP allowlist check for /api/life BEFORE public route check
  if (isLifeRoute(req)) {
    const ip = getClientIp(req);
    if (!LIFE_ALLOWED_IPS.has(ip)) {
      console.warn('[middleware] /api/life blocked from IP:', ip);
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml|json)).*)',
    '/(api|trpc)(.*)',
  ],
};
