import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { chatId, title } = await req.json()
    runQuery('UPDATE chats SET title = ? WHERE id = ? AND user_id = ?', [title, chatId, user.id])
    return NextResponse.json({ message: 'Renamed' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}