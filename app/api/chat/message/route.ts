import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const msg = await req.json()
    runQuery(
      `INSERT INTO messages (id, chat_id, user_id, role, content, attachments, model_used, sources)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.chat_id, user.id, msg.role, msg.content, JSON.stringify(msg.attachments || []), msg.model_used || null, JSON.stringify(msg.sources || [])]
    )
    runQuery('UPDATE chats SET updated_at = datetime("now") WHERE id = ?', [msg.chat_id])
    return NextResponse.json({ message: 'Saved' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}