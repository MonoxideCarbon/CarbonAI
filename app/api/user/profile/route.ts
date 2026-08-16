import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, updateUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const updates = await req.json()
    const updated = await updateUser(user.id, updates)
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ message: 'Updated', user: updated })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/profile]', error)
    return NextResponse.json({ error: 'Unable to update profile.' }, { status: 500 })
  }
}
