import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, updateUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { personality } = await req.json()
    if (personality !== 'humanoid' && personality !== 'professional') return NextResponse.json({ error: 'Invalid personality' }, { status: 400 })
    const updated = await updateUser(user.id, { personality })
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ message: 'Updated', user: updated })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/personality]', error)
    return NextResponse.json({ error: 'Unable to update personality.' }, { status: 500 })
  }
}
