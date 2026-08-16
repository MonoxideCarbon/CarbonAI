import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth(req)
    const { deleteUser } = await import('@/lib/auth')
    await deleteUser(user.id)
    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set({ name: 'auth_token', value: '', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0) })
    return response
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[auth/delete]', error)
    return NextResponse.json({ error: error?.message || 'Unable to delete account.' }, { status: 500 })
  }
}
