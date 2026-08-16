import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery, queryAll } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('id')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })

    const attachments = queryAll<{ storage_path: string; b2_file_id: string }>(
      'SELECT storage_path, b2_file_id FROM attachments WHERE chat_id = ? AND user_id = ?',
      [chatId, user.id]
    )
    for (const att of attachments) {
      try { await deleteFile(att.b2_file_id, att.storage_path) } catch {}
    }

    runQuery('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.id])
    return NextResponse.json({ message: 'Deleted' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}