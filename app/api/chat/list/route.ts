import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listChats } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    return NextResponse.json({ chats: await listChats(user.id) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/list]', error)
    return NextResponse.json({ error: 'Unable to load chats.' }, { status: 500 })
  }
}
