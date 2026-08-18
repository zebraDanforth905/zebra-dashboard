import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { env } from '@/app/lib/env'

const authSecret = env.AUTH_SECRET;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
  runtime: 'nodejs',
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname.startsWith('/login');
  const isPublicParentRoute =
    pathname.startsWith('/summer-reg') || pathname.startsWith('/fall-confirm');
  const isBillingRoute = pathname.startsWith('/dashboard/billing');
  const shouldRequireLogin =
    pathname === '/' || (pathname.startsWith('/dashboard') && !isBillingRoute);

  if (shouldRequireLogin && !isLoginRoute && !isPublicParentRoute) {
    const token = await getToken({
      req: request,
      secret: authSecret,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set(
        'callbackUrl',
        pathname === '/' ? '/dashboard' : `${pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(loginUrl);
    }

    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Protect admin routes - admin access only
  if (request.nextUrl.pathname.startsWith('/dashboard/admin')) {
    const token = await getToken({
      req: request,
      secret: authSecret,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    if ((token as any)?.user_type !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (request.nextUrl.pathname.startsWith('/dashboard/billing')){
    const token = await getToken({
      req: request,
      secret: authSecret,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    if ((token as any)?.user_type !== 'admin') {
      return NextResponse.rewrite(new URL('/dashboard/billing/unauthorized-user', request.url))
    }
  }
 
  // if (request.nextUrl.pathname.startsWith('/dashboard')) {
  //   return NextResponse.rewrite(new URL('/dashboard/user', request.url))
  // }
}
