import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, createUser, createToken, setAuthCookie, getUserByEmail } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, access_key } = await req.json()
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : ''
    if (!normalizedEmail || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (min 6 chars) required' }, { status: 400 })
    }

    const requiredAccessKey = process.env.ACCESS_KEY || process.env.REGISTRATION_PASSWORD
    if (requiredAccessKey && access_key !== requiredAccessKey) {
      return NextResponse.json({ error: 'Invalid access key / registration password' }, { status: 403 })
    }

    if (await getUserByEmail(normalizedEmail)) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const id = crypto.randomUUID()
    const password_hash = await hashPassword(password)
    await createUser({ id, email: normalizedEmail, password_hash, full_name })

    const token = await createToken(id, normalizedEmail)
    const response = NextResponse.json({
      message: 'Account created successfully',
      user: { id, email: normalizedEmail, full_name, personality: 'humanoid', theme: 'system', memory_enabled: true },
    })
    response.cookies.set({ name: 'auth_token', value: token, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 24 * 60 * 60 })
    return response
  } catch (error: any) {
    console.error('[auth/signup]', error)
    return NextResponse.json({ error: error?.message || 'Signup failed' }, { status: 500 })
  }
}
