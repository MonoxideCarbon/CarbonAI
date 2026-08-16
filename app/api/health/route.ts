import { NextResponse } from 'next/server'
import { getHealthCache } from '@/lib/ai/router'

export const runtime = 'nodejs'

export async function GET() {
  const models = Array.from(getHealthCache().values())
  const healthy = models.filter(m => m.isHealthy)
  return NextResponse.json({
    status: healthy.length > 0 ? 'healthy' : 'unhealthy',
    providers: {
      gemini: models.some(m => m.provider === 'gemini' && m.isHealthy),
      groq: models.some(m => m.provider === 'groq' && m.isHealthy),
      openrouter: models.some(m => m.provider === 'openrouter' && m.isHealthy)
    },
    timestamp: new Date().toISOString()
  })
}