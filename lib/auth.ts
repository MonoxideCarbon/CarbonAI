import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { User } from '@/types'

const JWT_SECRET = process.env.JWT_SECRET || 'carbonai-private-secret-key-change-in-production-2026'

// --- PASSWORD HASHING (PBKDF2) ---

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex')
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err)
      resolve(`${salt}:${derivedKey.toString('hex')}`)
    })
  })
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = storedHash.split(':')
    if (parts.length !== 2) return resolve(false)
    const [salt, key] = parts
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return resolve(false)
      resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey))
    })
  })
}

// --- JWT TOKEN GENERATION & VERIFICATION (HMAC-SHA256) ---

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function createToken(userId: string, email: string): Promise<string> {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  const payload = JSON.stringify({
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
  })

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, signature] = parts
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    if (signature !== expectedSignature) return null

    const payload = JSON.parse(base64UrlDecode(encodedPayload))
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null
    }

    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

// --- COOKIE HELPERS ---

export function setAuthCookie(token: string): string {
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
}

export function clearAuthCookie(): string {
  return `auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

// --- DATABASE USER OPERATIONS ---

function getDb() {
  return require('@/lib/db')
}

export function getUserByEmail(email: string): User | undefined {
  return getDb().queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()])
}

export function getUserById(id: string): User | undefined {
  return getDb().queryOne('SELECT * FROM users WHERE id = ?', [id])
}

export function createUser(data: {
  id: string
  email: string
  password_hash: string
  full_name?: string
  verification_token?: string
}): void {
  getDb().runQuery(
    `INSERT INTO users (id, email, password_hash, full_name, verification_token, email_verified)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      data.id,
      data.email.toLowerCase().trim(),
      data.password_hash,
      data.full_name || null,
      data.verification_token || null,
    ]
  )
}

export function deleteUser(userId: string): void {
  getDb().runQuery('DELETE FROM users WHERE id = ?', [userId])
}

export function updateUser(userId: string, updates: Partial<User>): void {
  const allowed = ['full_name', 'avatar_url', 'personality', 'theme', 'memory_enabled']
  const keys = Object.keys(updates).filter((k) => allowed.includes(k))
  if (keys.length === 0) return
  const setClause = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => (updates as any)[k])
  getDb().runQuery(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = ?`, [...values, userId])
}

export function verifyUserEmail(token: string): boolean {
  const db = getDb()
  const user = db.queryOne('SELECT id FROM users WHERE verification_token = ?', [token])
  if (!user) return false
  db.runQuery('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?', [user.id])
  return true
}

export function setResetToken(email: string, token: string, expires: string): void {
  getDb().runQuery('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?', [
    token,
    expires,
    email.toLowerCase().trim(),
  ])
}

export function resetPassword(token: string, passwordHash: string): boolean {
  const db = getDb()
  const user = db.queryOne('SELECT id FROM users WHERE reset_token = ?', [token])
  if (!user) return false

  db.runQuery(
    'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
    [passwordHash, user.id]
  )
  return true
}

// --- REQUEST CONTEXT AUTHENTICATION ---

export async function getCurrentUser(req?: Request | NextRequest): Promise<User | null> {
  try {
    let token: string | undefined

    if (req) {
      if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
        token = (req as NextRequest).cookies.get('auth_token')?.value
      } else {
        const cookieHeader = req.headers.get('cookie')
        if (cookieHeader) {
          const match = cookieHeader.match(/auth_token=([^;]+)/)
          if (match) token = match[1]
        }
      }

      if (!token) {
        const authHeader = req.headers.get('authorization')
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7)
        }
      }
    } else {
      try {
        const cookieStore = cookies()
        token = cookieStore.get('auth_token')?.value
      } catch {}
    }

    if (!token) return null

    const payload = verifyToken(token)
    if (!payload) return null

    if (process.env.NEXT_RUNTIME === 'edge') {
      return {
        id: payload.userId,
        email: payload.email,
        password_hash: '',
        personality: 'humanoid',
        theme: 'system',
        memory_enabled: 1,
        email_verified: 1,
        created_at: '',
        updated_at: '',
      } as User
    }

    const user = getUserById(payload.userId)
    return user || null
  } catch {
    return null
  }
}

export async function requireAuth(req?: Request | NextRequest): Promise<User> {
  const user = await getCurrentUser(req)
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

// --- EMAIL UTILITY ---

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.SMTP_HOST) {
    console.log(`[SMTP] Sending email to ${to}: ${subject}`)
  } else {
    console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject} | HTML: ${html}`)
  }
}
