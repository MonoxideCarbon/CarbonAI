import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { updateChat } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { chatId, pinned } = await req.json()
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })
    const chat = await updateChat(user.id, chatId, { pinned: Boolean(pinned) })
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    return NextResponse.json({ message: 'Updated', chat })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/pin]', error)
    return NextResponse.json({ error: 'Unable to update chat.' }, { status: 500 })
  }
}
