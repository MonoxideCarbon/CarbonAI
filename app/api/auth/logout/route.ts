import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST() {
  const cookie = clearAuthCookie()
  return NextResponse.json({ message: 'Logged out' }, { headers: { 'Set-Cookie': cookie } })
}