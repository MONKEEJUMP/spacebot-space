import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/botspace(.*)',
  '/peoplespace(.*)',
  '/expertspace(.*)',
  '/lab(.*)',
  '/feed(.*)',
  '/themes(.*)',
  '/sanctuary(.*)',
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
  '/api/v1/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
