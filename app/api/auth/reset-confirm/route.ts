import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, resetPassword } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Token and password (min 6 chars) required' }, { status: 400 })
    }
    const success = await resetPassword(token, await hashPassword(password))
    if (!success) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    return NextResponse.json({ message: 'Password updated successfully' })
  } catch (error: any) {
    console.error('[auth/reset-confirm]', error)
    return NextResponse.json({ error: error?.message || 'Unable to reset password' }, { status: 500 })
  }
}
