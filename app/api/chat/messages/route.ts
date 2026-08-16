import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listMessages } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('chatId')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })
    return NextResponse.json({ messages: await listMessages(user.id, chatId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/messages]', error)
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 })
  }
}
