import crypto from 'crypto'

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

let authCache: { auth: B2Auth; expires: number } | null = null

function encodeB2Path(fileName: string): string {
  return fileName.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function invalidateAuth() {
  authCache = null
}

async function getAuth(forceRefresh = false): Promise<B2Auth> {
  if (!forceRefresh && authCache && Date.now() < authCache.expires) return authCache.auth

  const keyId = process.env.B2_KEY_ID!
  const appKey = process.env.B2_APPLICATION_KEY!
  if (!keyId || !appKey) throw new Error('Backblaze B2 credentials are not configured')
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')

  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`B2 auth failed (${res.status})`)
  const data = await res.json()

  const auth: B2Auth = {
    authorizationToken: data.authorizationToken,
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
  }

  authCache = { auth, expires: Date.now() + 23 * 60 * 60 * 1000 }
  return auth
}

async function getUploadUrl(bucketId: string): Promise<{ uploadUrl: string; uploadAuthToken: string }> {
  const auth = await getAuth()
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Failed to get B2 upload URL (${res.status})`)
  return res.json()
}

export async function uploadFile(
  fileName: string,
  fileData: Buffer,
  contentType: string
): Promise<{ fileId: string; fileName: string }> {
  const bucketId = process.env.B2_BUCKET_ID
  if (!bucketId) throw new Error('B2_BUCKET_ID is not configured')

  const { uploadUrl, uploadAuthToken } = await getUploadUrl(bucketId)
  const hash = crypto.createHash('sha1').update(fileData).digest('hex')

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadAuthToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': contentType || 'b2/x-auto',
      'X-Bz-Content-Sha1': hash,
      'X-Bz-Info-Author': 'carbonai-private',
    },
    body: new Uint8Array(fileData),
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`B2 upload failed: ${err}`)
  }

  const data = await res.json()
  return { fileId: data.fileId, fileName: data.fileName }
}

export async function uploadJson<T>(fileName: string, value: T): Promise<{ fileId: string; fileName: string }> {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  return uploadFile(fileName, body, 'application/json')
}

export async function deleteFile(fileId: string, fileName: string): Promise<void> {
  let auth = await getAuth()
  let res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName }),
    cache: 'no-store',
  })

  if (res.status === 401) {
    invalidateAuth()
    auth = await getAuth(true)
    res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, fileName }),
      cache: 'no-store',
    })
  }

  if (!res.ok) throw new Error(`Failed to delete file from B2 (${res.status})`)
}

export async function deleteLatestFile(fileName: string): Promise<void> {
  const files = await listFiles(fileName, 1)
  const file = files[0]
  if (file) await deleteFile(file.fileId, file.fileName)
}

export async function listFiles(prefix: string = '', maxFileCount: number = 1000): Promise<Array<{ fileId: string; fileName: string; size: number; uploadTimestamp: number }>> {
  let auth = await getAuth()
  const bucketId = process.env.B2_BUCKET_ID
  if (!bucketId) throw new Error('B2_BUCKET_ID is not configured')

  const files: Array<{ fileId: string; fileName: string; size: number; uploadTimestamp: number }> = []
  let startFileName: string | undefined

  while (files.length < maxFileCount) {
    let res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucketId,
        prefix,
        maxFileCount: Math.min(1000, maxFileCount - files.length),
        ...(startFileName ? { startFileName } : {}),
      }),
      cache: 'no-store',
    })

    if (res.status === 401) {
      invalidateAuth()
      auth = await getAuth(true)
      res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketId,
          prefix,
          maxFileCount: Math.min(1000, maxFileCount - files.length),
          ...(startFileName ? { startFileName } : {}),
        }),
        cache: 'no-store',
      })
    }

    if (!res.ok) throw new Error(`B2 list failed (${res.status})`)
    const data = await res.json()
    const page = Array.isArray(data.files) ? data.files : []
    for (const file of page) files.push({
      fileId: file.fileId,
      fileName: file.fileName,
      size: file.contentLength || 0,
      uploadTimestamp: file.uploadTimestamp || 0,
    })

    if (!data.nextFileName || page.length === 0) break
    startFileName = data.nextFileName
  }

  return files
}

export async function getDownloadUrl(fileName: string): Promise<string> {
  const auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME
  if (!bucketName) throw new Error('B2_BUCKET_NAME is not configured')
  return `${auth.downloadUrl}/file/${bucketName}/${encodeB2Path(fileName)}`
}

export async function getSignedDownloadUrl(fileName: string, duration: number = 3600): Promise<string> {
  void duration
  return `/api/upload/download?file=${encodeURIComponent(fileName)}`
}

export async function downloadFile(fileName: string): Promise<{ data: Buffer; contentType: string }> {
  let auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME
  if (!bucketName) throw new Error('B2_BUCKET_NAME is not configured')
  const url = () => `${auth.downloadUrl}/file/${bucketName}/${encodeB2Path(fileName)}`

  let res = await fetch(url(), {
    headers: { Authorization: auth.authorizationToken },
    cache: 'no-store',
  })

  if (res.status === 401) {
    invalidateAuth()
    auth = await getAuth(true)
    res = await fetch(url(), {
      headers: { Authorization: auth.authorizationToken },
      cache: 'no-store',
    })
  }

  if (!res.ok) throw new Error(`Failed to download file from B2 (${res.status})`)
  const data = Buffer.from(await res.arrayBuffer())
  return { data, contentType: res.headers.get('content-type') || 'application/octet-stream' }
}

export async function downloadJson<T>(fileName: string): Promise<T | null> {
  try {
    const { data } = await downloadFile(fileName)
    return JSON.parse(data.toString('utf8')) as T
  } catch (error: any) {
    if (error?.message?.includes('(404)')) return null
    throw error
  }
}
