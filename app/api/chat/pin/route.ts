import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { chatId, pinned } = await req.json()
    runQuery('UPDATE chats SET pinned = ? WHERE id = ? AND user_id = ?', [pinned ? 1 : 0, chatId, user.id])
    return NextResponse.json({ message: 'Updated' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}