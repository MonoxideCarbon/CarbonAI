import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, deleteUser, clearAuthCookie } from '@/lib/auth'
import { listAttachments } from '@/lib/db'
import { deleteFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const attachments = await listAttachments(user.id)
    for (const attachment of attachments) {
      if (attachment.b2_file_id && attachment.storage_path) {
        try { await deleteFile(attachment.b2_file_id, attachment.storage_path) } catch {}
      }
    }
    await deleteUser(user.id)
    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set({ name: 'auth_token', value: '', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return response
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[auth/delete]', error)
    return NextResponse.json({ error: 'Unable to delete account.' }, { status: 500 })
  }
}
