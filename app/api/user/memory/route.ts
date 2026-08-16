import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runQuery, queryOne } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { id, key, value } = await req.json()
    if (key !== undefined) runQuery('UPDATE memories SET key = ? WHERE id = ? AND user_id = ?', [key, id, user.id])
    if (value !== undefined) runQuery('UPDATE memories SET value = ? WHERE id = ? AND user_id = ?', [value, id, user.id])
    return NextResponse.json({ message: 'Updated' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { key, value } = await req.json()
    const id = crypto.randomUUID()
    runQuery('INSERT OR REPLACE INTO memories (id, user_id, key, value) VALUES (?, ?, ?, ?)', [id, user.id, key, value])
    const memory = queryOne('SELECT * FROM memories WHERE id = ?', [id])
    return NextResponse.json({ memory })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    runQuery('DELETE FROM memories WHERE id = ? AND user_id = ?', [id, user.id])
    return NextResponse.json({ message: 'Deleted' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}