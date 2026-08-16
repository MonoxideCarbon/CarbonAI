import { NextResponse } from 'next/server'
import { getHealthCache } from '@/lib/ai/router'
import { queryOne } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const models = Array.from(getHealthCache().values())
  const healthyModels = models.filter(m => m.isHealthy)

  let database: 'healthy' | 'unavailable' = 'healthy'
  let databaseError: string | undefined

  try {
    queryOne<{ ok: number }>('SELECT 1 AS ok')
  } catch (error) {
    database = 'unavailable'
    databaseError = process.env.NODE_ENV === 'development'
      ? (error instanceof Error ? error.message : String(error))
      : 'Database unavailable'
  }

  const status = healthyModels.length > 0 && database === 'healthy' ? 'healthy' : 'degraded'

  return NextResponse.json({
    status,
    database,
    ...(databaseError ? { databaseError } : {}),
    providers: {
      gemini: models.some(m => m.provider === 'gemini' && m.isHealthy),
      groq: models.some(m => m.provider === 'groq' && m.isHealthy),
      openrouter: models.some(m => m.provider === 'openrouter' && m.isHealthy),
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
