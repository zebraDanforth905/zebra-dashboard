import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isCurrentAdminToken, isTokenSessionCurrent } from '@/app/lib/auth-security';

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
  runtime: 'nodejs',
};

function loginRedirect(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set(
    'callbackUrl',
    pathname === '/' ? '/dashboard' : `${pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname.startsWith('/login');
  const isPublicParentRoute = pathname.startsWith('/summer-reg');
  const isBillingRoute = pathname.startsWith('/dashboard/billing');
  const shouldRequireLogin =
    pathname === '/' || (pathname.startsWith('/dashboard') && !isBillingRoute);

  const token = await getToken({
    req: request,
    secret: authSecret,
    secureCookie: process.env.NODE_ENV === 'production',
  });

  if (shouldRequireLogin && !isLoginRoute && !isPublicParentRoute) {
    if (!token || !(await isTokenSessionCurrent(token as any))) {
      return loginRedirect(request);
    }

    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (pathname.startsWith('/dashboard/admin')) {
    if (!(await isCurrentAdminToken(token as any))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (pathname.startsWith('/dashboard/billing')) {
    if (!(await isCurrentAdminToken(token as any))) {
      return NextResponse.rewrite(new URL('/dashboard/billing/unauthorized-user', request.url));
    }
  }
}
