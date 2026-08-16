import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll } from '@/lib/db'
import { Chat } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const chats = queryAll<Chat>(
      `SELECT * FROM chats WHERE user_id = ? AND archived = 0
       ORDER BY pinned DESC, updated_at DESC`,
      [user.id]
    )
    return NextResponse.json({ chats })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}