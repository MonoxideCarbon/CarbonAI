import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, saveAttachment, findAttachmentByStoragePath } from '@/lib/db'
import { getSupabaseAdmin, getSupabaseBucket } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file')
    const chatId = String(formData.get('chatId') || '')

    if (!(file instanceof File) || !chatId) return NextResponse.json({ error: 'File and chatId required' }, { status: 400 })
    if (file.size > MAX_UPLOAD_SIZE) return NextResponse.json({ error: 'Files must be 4MB or smaller on Vercel.' }, { status: 413 })

    const chat = await getChat(user.id, chatId)
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const attachmentId = crypto.randomUUID()
    const storagePath = `${user.id}/${chatId}/${attachmentId}-${file.name.replace(/[\\/:*?"<>|]/g, '_')}`
    const supabase = getSupabaseAdmin()
    const bucket = getSupabaseBucket()
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw new Error(`Supabase file upload failed: ${uploadError.message}`)

    try {
      await saveAttachment(user.id, {
        id: attachmentId,
        user_id: user.id,
        chat_id: chatId,
        filename: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        storage_path: storagePath,
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      await supabase.storage.from(bucket).remove([storagePath])
      throw error
    }

    return NextResponse.json({
      id: attachmentId,
      filename: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: storagePath,
      public_url: `/api/upload?file=${encodeURIComponent(storagePath)}`,
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

    const attachment = await findAttachmentByStoragePath(user.id, fileName)
    if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await getSupabaseAdmin().storage.from(getSupabaseBucket()).download(fileName)
    if (error || !data) throw new Error(error?.message || 'Supabase download failed')

    return new Response(data, {
      headers: {
        'Content-Type': attachment.file_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${String(attachment.filename).replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[upload/download]', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
