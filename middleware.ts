import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
  runtime: 'nodejs',
};

export async function middleware(request: NextRequest) {

  console.log("token: ", request)
  if (request.nextUrl.pathname.startsWith('/dashboard/camp')) {
    return NextResponse.rewrite(new URL('/dashboard/schedule', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/dashboard/billing')){
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET as string });
    
    if ((token as any)?.user_type !== 'admin') {
      return NextResponse.rewrite(new URL('/dashboard/billing/unauthorized-user', request.url))
    }
  }
 
  // if (request.nextUrl.pathname.startsWith('/dashboard')) {
  //   return NextResponse.rewrite(new URL('/dashboard/user', request.url))
  // }
}