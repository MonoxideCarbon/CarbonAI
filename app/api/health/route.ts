import { NextResponse } from 'next/server'
import { getHealthCache } from '@/lib/ai/router'
import { getStorageHealth } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const models = Array.from(getHealthCache().values())
  const healthyModels = models.filter(m => m.isHealthy)
  let storage: 'healthy' | 'unavailable' = 'healthy'
  let storageError: string | undefined

  try {
    await getStorageHealth()
  } catch (error) {
    storage = 'unavailable'
    storageError = process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : 'Supabase storage/database unavailable'
  }

  const status = healthyModels.length > 0 && storage === 'healthy' ? 'healthy' : 'degraded'
  return NextResponse.json({
    status,
    storage,
    ...(storageError ? { storageError } : {}),
    providers: {
      gemini: models.some(m => m.provider === 'gemini' && m.isHealthy),
      groq: models.some(m => m.provider === 'groq' && m.isHealthy),
      openrouter: models.some(m => m.provider === 'openrouter' && m.isHealthy),
    },
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
