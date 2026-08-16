import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, saveMessage, updateChat } from '@/lib/db'
import type { Message } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const msg = await req.json()
    if (!msg?.id || !msg?.chat_id || msg.role !== 'user' || typeof msg?.content !== 'string') {
      return NextResponse.json({ error: 'Invalid user message' }, { status: 400 })
    }

    const chat = await getChat(user.id, String(msg.chat_id))
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const message: Message = {
      id: String(msg.id),
      chat_id: String(msg.chat_id),
      user_id: user.id,
      role: 'user',
      content: msg.content,
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      model_used: undefined,
      sources: [],
      created_at: typeof msg.created_at === 'string' ? msg.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await saveMessage(message)
    await updateChat(user.id, message.chat_id, {})
    return NextResponse.json({ message: 'Saved' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/message]', error)
    return NextResponse.json({ error: 'Unable to save message.' }, { status: 500 })
  }
}
