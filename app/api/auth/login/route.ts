import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createToken, setAuthCookie, getUserByEmail } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

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
    const cookie = setAuthCookie(token)

    return NextResponse.json(
      { user: { id: user.id, email: user.email, full_name: user.full_name, personality: user.personality, theme: user.theme } },
      { headers: { 'Set-Cookie': cookie } }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Login failed' }, { status: 500 })
  }
}