import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteChat, listChats } from '@/lib/db'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    const chats = await listChats(user.id)
    await Promise.all(chats.map(chat => deleteChat(user.id, chat.id)))
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/chats]', error)
    return NextResponse.json({ error: error?.message || 'Unable to delete chats.' }, { status: 500 })
  }
}
