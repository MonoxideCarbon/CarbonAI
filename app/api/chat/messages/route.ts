import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll } from '@/lib/db'
import { Message } from '@/types'

export const runtime = 'nodejs'

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('chatId')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })

    const messages = queryAll<Message>(
      `SELECT * FROM messages
       WHERE chat_id = ? AND user_id = ?
       ORDER BY created_at ASC, rowid ASC`,
      [chatId, user.id]
    )

    const parsed = messages.map((m) => ({
      ...m,
      attachments: parseJson(m.attachments, []),
      sources: parseJson(m.sources, []),
    }))

    return NextResponse.json({ messages: parsed })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[chat/messages]', error)
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 })
  }
}
