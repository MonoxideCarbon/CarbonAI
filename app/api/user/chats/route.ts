import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery, queryAll } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    const attachments = queryAll<{ storage_path: string; b2_file_id: string }>(
      'SELECT storage_path, b2_file_id FROM attachments WHERE user_id = ?', [user.id]
    )
    for (const att of attachments) {
      try { await deleteFile(att.b2_file_id, att.storage_path) } catch {}
    }
    runQuery('DELETE FROM chats WHERE user_id = ?', [user.id])
    return NextResponse.json({ message: 'Deleted' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}