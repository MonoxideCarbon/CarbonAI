import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteChat, listAttachments } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('id')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })

    const attachments = (await listAttachments(user.id)).filter(a => a.chat_id === chatId)
    for (const att of attachments) {
      if (att.b2_file_id && att.storage_path) {
        try { await deleteFile(att.b2_file_id, att.storage_path) } catch {}
      }
    }
    await deleteChat(user.id, chatId)
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/delete]', error)
    return NextResponse.json({ error: 'Unable to delete chat.' }, { status: 500 })
  }
}
