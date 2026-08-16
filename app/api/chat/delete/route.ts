import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteChat } from '@/lib/db'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const chatId = req.nextUrl.searchParams.get('id')
    if (!chatId) return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })
    await deleteChat(user.id, chatId)
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[chat/delete]', error)
    return NextResponse.json({ error: error?.message || 'Unable to delete chat.' }, { status: 500 })
  }
}
