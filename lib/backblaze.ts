import crypto from 'crypto'

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

let authCache: { auth: B2Auth; expires: number } | null = null

async function getAuth(): Promise<B2Auth> {
  if (authCache && Date.now() < authCache.expires) return authCache.auth

  const keyId = process.env.B2_KEY_ID!
  const appKey = process.env.B2_APPLICATION_KEY!
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')

  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!res.ok) throw new Error('B2 auth failed')
  const data = await res.json()

  const auth: B2Auth = {
    authorizationToken: data.authorizationToken,
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
  }

  authCache = { auth, expires: Date.now() + 23 * 60 * 60 * 1000 } // 23 hours
  return auth
}

async function getUploadUrl(bucketId: string): Promise<{ uploadUrl: string; uploadAuthToken: string }> {
  const auth = await getAuth()
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
  })

  if (!res.ok) throw new Error('Failed to get upload URL')
  return res.json()
}

export async function uploadFile(
  fileName: string,
  fileData: Buffer,
  contentType: string
): Promise<{ fileId: string; fileName: string }> {
  const bucketId = process.env.B2_BUCKET_ID!
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
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`B2 upload failed: ${err}`)
  }

  const data = await res.json()
  return { fileId: data.fileId, fileName: data.fileName }
}

export async function deleteFile(fileId: string, fileName: string): Promise<void> {
  const auth = await getAuth()
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName }),
  })

  if (!res.ok) throw new Error('Failed to delete file from B2')
}

export async function getDownloadUrl(fileName: string): Promise<string> {
  const auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME!
  return `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}`
}

export async function getSignedDownloadUrl(fileName: string, duration: number = 3600): Promise<string> {
  // For private buckets, B2 requires authorization. 
  // We'll return a proxied URL that hits our API
  return `/api/upload/download?file=${encodeURIComponent(fileName)}`
}

export async function downloadFile(fileName: string): Promise<{ data: Buffer; contentType: string }> {
  const auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME!
  const url = `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}`

  const res = await fetch(url, {
    headers: { Authorization: auth.authorizationToken },
  })

  if (!res.ok) throw new Error('Failed to download file')
  const data = Buffer.from(await res.arrayBuffer())
  return { data, contentType: res.headers.get('content-type') || 'application/octet-stream' }
}
