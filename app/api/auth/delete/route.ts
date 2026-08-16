import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, deleteUser, clearAuthCookie } from '@/lib/auth'
import { queryAll, runQuery } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const userId = user.id

    // Delete attachments from B2
    const attachments = queryAll<{ storage_path: string; b2_file_id: string }>(
      'SELECT storage_path, b2_file_id FROM attachments WHERE user_id = ?',
      [userId]
    )
    for (const att of attachments) {
      try { await deleteFile(att.b2_file_id, att.storage_path) } catch {}
    }

    // Delete user (cascades to chats, messages, memories, attachments via SQLite FK)
    deleteUser(userId)

    const cookie = clearAuthCookie()
    return NextResponse.json({ message: 'Account deleted' }, { headers: { 'Set-Cookie': cookie } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: 401 })
  }
}