import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name ?? null,
        personality: user.personality || 'humanoid',
        theme: user.theme || 'system',
        memory_enabled: Boolean(user.memory_enabled),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ user: null, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    console.error('[auth/me]', error)
    return NextResponse.json({ user: null, error: 'Authentication service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
