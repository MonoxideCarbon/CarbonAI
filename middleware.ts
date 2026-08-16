import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUserEdge } from './lib/auth-edge'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const user = await getCurrentUserEdge(request)
  const hasResetToken = request.nextUrl.searchParams.has('reset')

  if (pathname.startsWith('/chat') || pathname.startsWith('/settings')) {
    if (!user) return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname === '/' && user && !hasResetToken) return NextResponse.redirect(new URL('/chat', request.url))
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
