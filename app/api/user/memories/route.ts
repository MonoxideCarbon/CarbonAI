import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteAllMemories, listMemories } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    return NextResponse.json({ memories: await listMemories(user.id) })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/memories]', error)
    return NextResponse.json({ error: 'Unable to load memories.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    await deleteAllMemories(user.id)
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/memories]', error)
    return NextResponse.json({ error: 'Unable to delete memories.' }, { status: 500 })
  }
}
