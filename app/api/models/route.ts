import { NextResponse } from 'next/server'
import { getHealthCache } from '@/lib/ai/router'

export const runtime = 'nodejs'

export async function GET() {
  const models = Array.from(getHealthCache().values())
  return NextResponse.json({
    healthy: models.filter(m => m.isHealthy).length,
    total: models.length,
    status: models.some(m => m.isHealthy) ? 'operational' : 'degraded'
  })
}