import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createToken, getUserByEmail } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const user = getUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await createToken(user.id, user.email)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name ?? null,
        personality: user.personality || 'humanoid',
        theme: user.theme || 'system',
        memory_enabled: Boolean(user.memory_enabled),
      },
    })

    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (error: unknown) {
    console.error('[auth/login]', error)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
