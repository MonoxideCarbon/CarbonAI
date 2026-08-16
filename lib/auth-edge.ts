import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'carbonai-private-secret-key-change-this-in-production'

function base64UrlDecodeBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function base64UrlDecodeText(str: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(str))
}

function base64UrlEncode(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function verifyTokenEdge(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const payload = JSON.parse(base64UrlDecodeText(encodedPayload))
    if (!payload.sub || !payload.email || (payload.exp && Math.floor(Date.now() / 1000) > payload.exp)) return null

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecodeBytes(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`))
    if (!valid) return null

    return { userId: String(payload.sub), email: String(payload.email) }
  } catch {
    return null
  }
}

export async function getCurrentUserEdge(req: NextRequest): Promise<{ userId: string; email: string } | null> {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return null
  return verifyTokenEdge(token)
}
