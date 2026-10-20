import { isPrivatePath } from './scripts/static-file-policy.mjs';

// Run before every route, including static files accidentally included in a deployment.
export const config = {
  matcher: ['/:path*'],
};

export function middleware(context) {
  const { pathname } = new URL(context.request.url);
  if (isPrivatePath(pathname)) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  if (pathname.startsWith('/u/')) return context.rewrite('/index.html');
  return context.next();
}
