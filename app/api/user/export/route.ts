import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { exportUserData } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const data = await exportUserData(user.id)
    return NextResponse.json({
      user: { id: user.id, email: user.email, full_name: user.full_name },
      ...data,
      exportedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/export]', error)
    return NextResponse.json({ error: 'Unable to export account data.' }, { status: 500 })
  }
}
