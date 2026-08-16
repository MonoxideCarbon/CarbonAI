import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteChat, listAttachments, listChats } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    const attachments = await listAttachments(user.id)
    for (const att of attachments) {
      if (att.b2_file_id && att.storage_path) {
        try { await deleteFile(att.b2_file_id, att.storage_path) } catch {}
      }
    }
    const chats = await listChats(user.id)
    await Promise.all(chats.map(chat => deleteChat(user.id, chat.id)))
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/chats]', error)
    return NextResponse.json({ error: 'Unable to delete chats.' }, { status: 500 })
  }
}
