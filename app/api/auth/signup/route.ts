import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, createUser, createToken, setAuthCookie } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { User } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, access_key } = await req.json()

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (min 6 chars) required' }, { status: 400 })
    }

    const requiredAccessKey = process.env.ACCESS_KEY || process.env.REGISTRATION_PASSWORD
    if (requiredAccessKey) {
      if (!access_key || access_key !== requiredAccessKey) {
        return NextResponse.json({ error: 'Invalid access key / registration password' }, { status: 403 })
      }
    }

    const existing = queryOne<User>('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()])
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    const password_hash = await hashPassword(password)

    createUser({ id, email, password_hash, full_name })

    const token = await createToken(id, email.toLowerCase().trim())
    const cookie = setAuthCookie(token)

    return NextResponse.json(
      {
        message: 'Account created successfully',
        user: { id, email: email.toLowerCase().trim(), full_name, personality: 'humanoid', theme: 'system' }
      },
      { headers: { 'Set-Cookie': cookie } }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Signup failed' }, { status: 500 })
  }
}