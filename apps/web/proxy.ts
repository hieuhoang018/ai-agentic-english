import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/main(.*)', '/onboarding(.*)']);

export const config = {
  matcher: ['/main/:path*', '/onboarding/:path*', '/api/:path*', '/__clerk/:path*'],
};

// Export the clerk middleware as the proxy handler so `auth()` detects it at runtime.
// Protect app routes before Server Components call backend services that require a bearer token.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});
