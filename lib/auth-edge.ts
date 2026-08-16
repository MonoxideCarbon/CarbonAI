import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'carbonai-private-secret-key-change-in-production-2026'

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, signature] = parts
    
    // Validate payload expiration
    const payload = JSON.parse(base64UrlDecode(encodedPayload))
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null
    }

    if (!payload.sub || !payload.email) return null

    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function getCurrentUserEdge(req: NextRequest): { userId: string; email: string } | null {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return null
  return verifyToken(token)
}
