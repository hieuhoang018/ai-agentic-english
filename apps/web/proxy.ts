import { clerkMiddleware } from '@clerk/nextjs/server';

export const config = {
  matcher: ['/onboarding/:path*', '/(api|trpc)(.*)', '/__clerk/:path*'],
};

// Export the clerk middleware as the proxy handler so `auth()` detects it at runtime
export default clerkMiddleware();
