import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        personality: user.personality,
        theme: user.theme,
        memory_enabled: user.memory_enabled,
      }
    })
  } catch {
    return NextResponse.json({ user: null }, { status: 401 })
  }
}