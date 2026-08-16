import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { performWebSearch } from '@/lib/ai/router'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const { query } = await req.json()
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 })

    const results = await performWebSearch(query)
    return NextResponse.json({ results })
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ results: [] })
  }
}