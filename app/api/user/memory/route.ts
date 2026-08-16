import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteMemory, updateMemory, upsertMemory } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { id, key, value } = await req.json()
    if (!id && typeof key === 'string' && typeof value === 'string') {
      return NextResponse.json({ memory: await upsertMemory(user.id, key.trim(), value) })
    }
    if (!id) return NextResponse.json({ error: 'Memory ID required' }, { status: 400 })
    const memory = await updateMemory(user.id, id, { ...(key !== undefined ? { key } : {}), ...(value !== undefined ? { value } : {}) })
    if (!memory) return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    return NextResponse.json({ message: 'Updated', memory })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/memory]', error)
    return NextResponse.json({ error: 'Unable to update memory.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { key, value } = await req.json()
    if (typeof key !== 'string' || typeof value !== 'string' || !key.trim()) return NextResponse.json({ error: 'Key and value required' }, { status: 400 })
    return NextResponse.json({ memory: await upsertMemory(user.id, key.trim(), value) })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/memory]', error)
    return NextResponse.json({ error: 'Unable to save memory.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    await deleteMemory(user.id, id)
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user/memory]', error)
    return NextResponse.json({ error: 'Unable to delete memory.' }, { status: 500 })
  }
}
