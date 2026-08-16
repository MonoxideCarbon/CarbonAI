import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const chats = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM chats WHERE user_id = ?', [user.id])
    const messages = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages WHERE user_id = ?', [user.id])
    const media = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM attachments WHERE user_id = ?', [user.id])
    return NextResponse.json({ chats: chats?.count || 0, messages: messages?.count || 0, media: media?.count || 0 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}