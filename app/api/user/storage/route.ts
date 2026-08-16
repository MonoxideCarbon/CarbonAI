import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listAttachments, listChats, listMessages } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const [chats, attachments] = await Promise.all([listChats(user.id), listAttachments(user.id)])
    const messageLists = await Promise.all(chats.map(chat => listMessages(user.id, chat.id)))
    const messages = messageLists.reduce((sum, list) => sum + list.length, 0)
    return NextResponse.json({ chats: chats.length, messages, media: attachments.length })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/storage]', error)
    return NextResponse.json({ error: 'Unable to load storage statistics.' }, { status: 500 })
  }
}
