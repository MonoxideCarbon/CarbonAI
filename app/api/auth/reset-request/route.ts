import { NextRequest, NextResponse } from 'next/server'
import { generateToken, setResetToken, sendEmail, getUserByEmail } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const user = await getUserByEmail(normalizedEmail)
    if (!user) return NextResponse.json({ message: 'If the email exists, a reset link has been sent' })

    const token = generateToken()
    const expires = new Date(Date.now() + 3600000).toISOString()
    await setResetToken(normalizedEmail, token, expires)

    const resetUrl = `${req.nextUrl.origin}/?reset=${token}`
    const html = `<p>Reset your CarbonAI password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`
    try {
      if (process.env.SMTP_HOST) await sendEmail(normalizedEmail, 'Password reset request', html)
      else console.log('[DEV] Reset URL:', resetUrl)
    } catch { console.log('[DEV] Reset URL:', resetUrl) }

    return NextResponse.json({ message: 'If the email exists, a reset link has been sent' })
  } catch (error: any) {
    console.error('[auth/reset-request]', error)
    return NextResponse.json({ error: error?.message || 'Unable to request reset' }, { status: 500 })
  }
}
