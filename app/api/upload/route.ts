import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryOne, runQuery } from '@/lib/db'
import { uploadFile, getDownloadUrl } from '@/lib/backblaze'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file') as File
    const chatId = formData.get('chatId') as string

    if (!file || !chatId) {
      return NextResponse.json({ error: 'File and chatId required' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = `${user.id}/${chatId}/${crypto.randomUUID()}-${file.name}`

    const { fileId } = await uploadFile(fileName, buffer, file.type)
    const publicUrl = await getDownloadUrl(fileName)

    const attachmentId = crypto.randomUUID()
    runQuery(
      `INSERT INTO attachments (id, user_id, chat_id, filename, file_type, file_size, storage_path, b2_file_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [attachmentId, user.id, chatId, file.name, file.type, file.size, fileName, fileId]
    )

    return NextResponse.json({
      id: attachmentId,
      filename: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: fileName,
      public_url: publicUrl
    })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
  }
}

// Download proxy for private files
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const fileName = req.nextUrl.searchParams.get('file')
    if (!fileName) return NextResponse.json({ error: 'File required' }, { status: 400 })

    // Verify ownership
    const att = queryOne('SELECT * FROM attachments WHERE storage_path = ? AND user_id = ?', [fileName, user.id])
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, contentType } = await import('@/lib/backblaze').then(m => m.downloadFile(fileName))
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': contentType } })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}