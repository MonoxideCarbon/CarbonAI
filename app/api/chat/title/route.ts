import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, getUserById, updateChat } from '@/lib/db'
import { generateResponse, getHealthCache, selectModel } from '@/lib/ai/router'
import type { Message } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 20

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const chatId = String(body?.chatId || '')
    const prompt = String(body?.prompt || '').trim()
    if (!chatId || !prompt) return NextResponse.json({ error: 'chatId and prompt required' }, { status: 400 })

    const chat = await getChat(user.id, chatId)
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const model = selectModel([{ id: 'title', chat_id: chatId, user_id: user.id, role: 'user', content: prompt, attachments: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Message], false, false, Math.ceil(prompt.length / 4))
    if (!model) return NextResponse.json({ error: 'No model available' }, { status: 503 })

    const userRecord = await getUserById(user.id)
    const system = 'Generate a short chat title from the user request. Return only 2 to 6 words, no quotes, no punctuation at the end, no explanation.'
    const titleMessage: Message = { id: crypto.randomUUID(), chat_id: chatId, user_id: user.id, role: 'user', content: prompt.slice(0, 1000), attachments: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    let title = ''
    for await (const chunk of generateResponse(model, [titleMessage], system, 0.2)) {
      title += chunk
      if (title.length >= 80) break
    }
    title = title.replace(/["'`]/g, '').replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim()
    if (!title) return NextResponse.json({ title: chat.title })
    title = title.split(' ').slice(0, 8).join(' ')
    await updateChat(user.id, chatId, { title })
    return NextResponse.json({ title })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/title]', error)
    return NextResponse.json({ error: error?.message || 'Unable to generate title' }, { status: 500 })
  }
}
