import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, updateUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const updates = await req.json()
    updateUser(user.id, updates)
    return NextResponse.json({ message: 'Updated' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}