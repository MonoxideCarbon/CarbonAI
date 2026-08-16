import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const [chats, messages, memories] = await Promise.all([
      queryAll('SELECT * FROM chats WHERE user_id = ?', [user.id]),
      queryAll('SELECT * FROM messages WHERE user_id = ?', [user.id]),
      queryAll('SELECT * FROM memories WHERE user_id = ?', [user.id]),
    ])
    const exportData = {
      user: { id: user.id, email: user.email, full_name: user.full_name },
      chats, messages, memories,
      exportedAt: new Date().toISOString()
    }
    return NextResponse.json(exportData)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}