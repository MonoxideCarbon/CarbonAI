import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { User } from '@/types'
import {
  createUser as createStoredUser,
  deleteUser as deleteStoredUser,
  getUserByEmail as getStoredUserByEmail,
  getUserById as getStoredUserById,
  resetPassword as resetStoredPassword,
  setResetToken as setStoredResetToken,
  updateUser as updateStoredUser,
  verifyUserEmail as verifyStoredUserEmail,
} from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'carbonai-private-secret-key-change-this-in-production'

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex')
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return reject(err)
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
      try { resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey)) } catch { resolve(false) }
    })
  })
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function generateToken(): string { return crypto.randomBytes(32).toString('hex') }

export async function createToken(userId: string, email: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  }))
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.${signature}`
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, signature] = parts
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const data = JSON.parse(base64UrlDecode(payload))
    if (!data.sub || !data.email || (data.exp && Math.floor(Date.now() / 1000) > data.exp)) return null
    return { userId: String(data.sub), email: String(data.email) }
  } catch { return null }
}

export function setAuthCookie(token: string): string {
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
}

export function clearAuthCookie(): string {
  return 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return getStoredUserByEmail(email)
}

export async function getUserById(id: string): Promise<User | undefined> {
  return getStoredUserById(id)
}

export async function createUser(data: {
  id: string
  email: string
  password_hash: string
  full_name?: string
  verification_token?: string
}): Promise<void> {
  await createStoredUser(data)
}

export async function deleteUser(userId: string): Promise<void> {
  await deleteStoredUser(userId)
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
  return updateStoredUser(userId, updates)
}

export async function verifyUserEmail(token: string): Promise<boolean> {
  return verifyStoredUserEmail(token)
}

export async function setResetToken(email: string, token: string, expires: string): Promise<void> {
  await setStoredResetToken(email, token, expires)
}

export async function resetPassword(token: string, passwordHash: string): Promise<boolean> {
  return resetStoredPassword(token, passwordHash)
}

export async function getCurrentUser(req?: Request | NextRequest): Promise<User | null> {
  let token: string | undefined
  try {
    if (req) {
      if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') token = (req as NextRequest).cookies.get('auth_token')?.value
      else {
        const match = req.headers.get('cookie')?.match(/(?:^|;\s*)auth_token=([^;]+)/)
        token = match?.[1]
      }
      if (!token) {
        const authHeader = req.headers.get('authorization')
        if (authHeader?.startsWith('Bearer ')) token = authHeader.substring(7)
      }
    } else {
      token = cookies().get('auth_token')?.value
    }
  } catch (error) {
    console.error('[auth/cookie]', error)
    throw new Error('Authentication service unavailable')
  }

  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  return (await getStoredUserById(payload.userId)) || null
}

export async function requireAuth(req?: Request | NextRequest): Promise<User> {
  const user = await getCurrentUser(req)
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.SMTP_HOST) console.log(`[SMTP] Sending email to ${to}: ${subject}`)
  else console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject} | HTML: ${html}`)
}
