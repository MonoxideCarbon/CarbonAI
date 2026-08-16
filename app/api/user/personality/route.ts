import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, updateUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { personality } = await req.json()
    updateUser(user.id, { personality })
    return NextResponse.json({ message: 'Updated' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}