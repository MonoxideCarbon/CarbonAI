import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createChat } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const user = await requireAuth(req)
    const chat = await createChat(user.id)
    return NextResponse.json({ chat })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/create]', error)
    const message = error?.message || 'Unable to create chat.'
    const status = /B2|storage|upload|bucket/i.test(message) ? 503 : 500
    return NextResponse.json({ error: message, code: status === 503 ? 'storage_unavailable' : 'chat_create_failed' }, { status })
  }
}
