import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { findAttachmentByStoragePath, saveAttachment } from '@/lib/db'
import { uploadFile, getDownloadUrl, downloadFile } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const chatId = formData.get('chatId') as string | null
    if (!file || !chatId) return NextResponse.json({ error: 'File and chatId required' }, { status: 400 })
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 })

    const bytes = await file.arrayBuffer()
    const fileName = `${user.id}/${chatId}/${crypto.randomUUID()}-${file.name.replace(/[\\/]/g, '_')}`
    const { fileId } = await uploadFile(fileName, Buffer.from(bytes), file.type)
    const attachment = {
      id: crypto.randomUUID(),
      user_id: user.id,
      chat_id: chatId,
      filename: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: fileName,
      b2_file_id: fileId,
      created_at: new Date().toISOString(),
    }
    await saveAttachment(user.id, attachment)
    return NextResponse.json({ ...attachment, public_url: await getDownloadUrl(fileName) })
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
    const att = await findAttachmentByStoragePath(user.id, fileName)
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data, contentType } = await downloadFile(fileName)
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' } })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[upload/download]', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
