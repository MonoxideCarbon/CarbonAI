import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { updateChat } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { chatId, title } = await req.json()
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 120) : ''
    if (!chatId || !cleanTitle) return NextResponse.json({ error: 'Chat ID and title required' }, { status: 400 })
    const chat = await updateChat(user.id, chatId, { title: cleanTitle })
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    return NextResponse.json({ message: 'Renamed', chat })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/rename]', error)
    return NextResponse.json({ error: 'Unable to rename chat.' }, { status: 500 })
  }
}
