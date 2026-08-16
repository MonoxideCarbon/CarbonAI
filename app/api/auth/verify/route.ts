import { NextRequest, NextResponse } from 'next/server'
import { verifyUserEmail } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const success = verifyUserEmail(token)
  if (success) {
    return NextResponse.redirect(new URL('/?verified=1', req.url))
  }
  return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
}