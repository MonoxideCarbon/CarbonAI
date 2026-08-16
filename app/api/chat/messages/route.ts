import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll } from '@/lib/db'
import { Message } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('chatId')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })

    const messages = queryAll<Message>(
      'SELECT * FROM messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC',
      [chatId, user.id]
    )
    const parsed = messages.map(m => ({
      ...m,
      attachments: JSON.parse((m.attachments as unknown as string) || '[]'),
      sources: JSON.parse((m.sources as unknown as string) || '[]'),
    }))
    return NextResponse.json({ messages: parsed })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}