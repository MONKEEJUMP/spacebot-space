import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/aispace(.*)',
  '/botspace(.*)',
  '/expertspace(.*)',
  '/factions(.*)',
  '/feed(.*)',
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
  '/api/life(.*)',
  '/api/chat(.*)',
  '/api/v1/(.*)',
  '/api/social(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
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
