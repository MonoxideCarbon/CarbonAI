import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll, runQuery } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    const memories = queryAll('SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC', [user.id])
    return NextResponse.json({ memories })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    runQuery('DELETE FROM memories WHERE user_id = ?', [user.id])
    return NextResponse.json({ message: 'Deleted' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}