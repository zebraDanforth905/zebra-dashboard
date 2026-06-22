import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
  runtime: 'nodejs',
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname.startsWith('/login');
  const isPublicParentRoute = pathname.startsWith('/summer-reg');
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
    console.log('Middleware - Admin route access check:', {
      path: request.nextUrl.pathname,
      hasAuthSecret: !!authSecret,
    });
    
    const token = await getToken({ 
      req: request, 
      secret: authSecret,
      secureCookie: process.env.NODE_ENV === 'production',
    });
    
    console.log('Middleware - Admin access check:', {
      path: request.nextUrl.pathname,
      hasToken: !!token,
      userType: (token as any)?.user_type,
      email: (token as any)?.email,
    });
    
    if ((token as any)?.user_type !== 'admin') {
      console.log('Access denied - user_type is not admin, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    
    console.log('Access granted - user is admin');
  }

  if (request.nextUrl.pathname.startsWith('/dashboard/billing')){
    console.log('Middleware - Environment check:', {
      hasAuthSecret: !!authSecret,
      authSecretLength: authSecret?.length,
      cookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
    });
    
    const token = await getToken({ 
      req: request, 
      secret: authSecret,
      secureCookie: process.env.NODE_ENV === 'production',
    });
    
    console.log('Middleware - Billing access check:', {
      path: request.nextUrl.pathname,
      hasToken: !!token,
      userType: (token as any)?.user_type,
      email: (token as any)?.email,
      tokenKeys: token ? Object.keys(token) : [],
    });
    
    if ((token as any)?.user_type !== 'admin') {
      console.log('Access denied - user_type is not admin');
      return NextResponse.rewrite(new URL('/dashboard/billing/unauthorized-user', request.url))
    }
    
    console.log('Access granted - user is admin');
  }
 
  // if (request.nextUrl.pathname.startsWith('/dashboard')) {
  //   return NextResponse.rewrite(new URL('/dashboard/user', request.url))
  // }
}
