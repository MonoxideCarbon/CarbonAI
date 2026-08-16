import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery, queryOne } from '@/lib/db'
import { Chat } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const user = await requireAuth(req)
    const id = crypto.randomUUID()
    runQuery('INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)', [id, user.id, 'New Chat'])
    const chat = queryOne<Chat>('SELECT * FROM chats WHERE id = ?', [id])
    return NextResponse.json({ chat })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}