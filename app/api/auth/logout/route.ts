import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out' })
  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}
