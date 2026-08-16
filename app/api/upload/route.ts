import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, saveAttachment } from '@/lib/db'
import { uploadFile, deleteFile, downloadFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file')
    const chatId = String(formData.get('chatId') || '')

    if (!(file instanceof File) || !chatId) {
      return NextResponse.json({ error: 'File and chatId required' }, { status: 400 })
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: 'Files must be 4MB or smaller on Vercel.' }, { status: 413 })
    }

    const chat = await getChat(user.id, chatId)
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = `${user.id}/${chatId}/${crypto.randomUUID()}-${file.name}`
    const { fileId } = await uploadFile(fileName, buffer, file.type)
    const attachmentId = crypto.randomUUID()

    try {
      await saveAttachment(user.id, {
        id: attachmentId,
        user_id: user.id,
        chat_id: chatId,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: fileName,
        b2_file_id: fileId,
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      try { await deleteFile(fileId, fileName) } catch {}
      throw error
    }

    return NextResponse.json({
      id: attachmentId,
      filename: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: fileName,
      public_url: `/api/upload?file=${encodeURIComponent(fileName)}`,
    })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[upload]', error)
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const fileName = req.nextUrl.searchParams.get('file')
    if (!fileName) return NextResponse.json({ error: 'File required' }, { status: 400 })

    const { findAttachmentByStoragePath } = await import('@/lib/db')
    const attachment = await findAttachmentByStoragePath(user.id, fileName)
    if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, contentType } = await downloadFile(fileName)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[upload/download]', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
