import crypto from 'crypto'

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

function encodeB2Path(fileName: string): string {
  return fileName.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function invalidateAuth() {
  authCache = null
}

let authCache: { auth: B2Auth; expires: number } | null = null

async function getAuth(forceRefresh = false): Promise<B2Auth> {
  if (!forceRefresh && authCache && Date.now() < authCache.expires) return authCache.auth

  const keyId = process.env.B2_KEY_ID?.trim()
  const appKey = process.env.B2_APPLICATION_KEY?.trim()
  if (!keyId || !appKey) throw new Error('Backblaze B2 credentials are not configured')

  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64')
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`B2 auth failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  if (!data?.authorizationToken || !data?.apiUrl || !data?.downloadUrl) {
    throw new Error('B2 authorization response was incomplete')
  }

  const auth: B2Auth = {
    authorizationToken: data.authorizationToken,
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
  }

  authCache = { auth, expires: Date.now() + 22 * 60 * 60 * 1000 }
  return auth
}

async function getUploadUrl(bucketId: string, forceRefresh = false): Promise<{ uploadUrl: string; uploadAuthToken: string }> {
  let auth = await getAuth(forceRefresh)
  let res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
    cache: 'no-store',
  })

  if (res.status === 401) {
    invalidateAuth()
    auth = await getAuth(true)
    res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId }),
      cache: 'no-store',
    })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to get B2 upload URL (${res.status}): ${body}`)
  }

  const data = await res.json()
  if (!data?.uploadUrl || !data?.authorizationToken) {
    throw new Error('B2 upload URL response was incomplete')
  }

  return { uploadUrl: data.uploadUrl, uploadAuthToken: data.authorizationToken }
}

async function uploadWithTarget(
  uploadUrl: string,
  uploadAuthToken: string,
  fileName: string,
  fileData: Buffer,
  contentType: string,
): Promise<Response> {
  const hash = crypto.createHash('sha1').update(fileData).digest('hex')
  return fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadAuthToken,
      'X-Bz-File-Name': encodeB2Path(fileName),
      'Content-Type': contentType || 'b2/x-auto',
      'Content-Length': String(fileData.byteLength),
      'X-Bz-Content-Sha1': hash,
      'X-Bz-Info-Author': 'carbonai-private',
    },
    body: new Uint8Array(fileData),
    cache: 'no-store',
  })
}

export async function uploadFile(
  fileName: string,
  fileData: Buffer,
  contentType: string,
): Promise<{ fileId: string; fileName: string }> {
  const bucketId = process.env.B2_BUCKET_ID?.trim()
  if (!bucketId) throw new Error('B2_BUCKET_ID is not configured')

  let target = await getUploadUrl(bucketId)
  let res = await uploadWithTarget(target.uploadUrl, target.uploadAuthToken, fileName, fileData, contentType)

  if (res.status === 401) {
    const body = await res.text().catch(() => '')
    let code = ''
    try {
      code = JSON.parse(body)?.code || ''
    } catch {
      // Ignore non-JSON error bodies.
    }

    if (code === 'bad_auth_token' || code === 'expired_auth_token') {
      target = await getUploadUrl(bucketId, true)
      res = await uploadWithTarget(target.uploadUrl, target.uploadAuthToken, fileName, fileData, contentType)
    } else {
      throw new Error(`B2 upload failed (401): ${body}`)
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`B2 upload failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  return { fileId: data.fileId, fileName: data.fileName }
}

export async function uploadJson<T>(fileName: string, value: T): Promise<{ fileId: string; fileName: string }> {
  return uploadFile(fileName, Buffer.from(JSON.stringify(value), 'utf8'), 'application/json')
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
      body: JSON.stringify({ bucketId, prefix, maxFileCount: Math.min(1000, maxFileCount - files.length), ...(startFileName ? { startFileName } : {}) }),
      cache: 'no-store',
    })

    if (res.status === 401) {
      invalidateAuth()
      auth = await getAuth(true)
      res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId, prefix, maxFileCount: Math.min(1000, maxFileCount - files.length), ...(startFileName ? { startFileName } : {}) }),
        cache: 'no-store',
      })
    }

    if (!res.ok) throw new Error(`B2 list failed (${res.status})`)
    const data = await res.json()
    const page = Array.isArray(data.files) ? data.files : []
    for (const file of page) files.push({ fileId: file.fileId, fileName: file.fileName, size: file.contentLength || 0, uploadTimestamp: file.uploadTimestamp || 0 })
    if (!data.nextFileName || page.length === 0) break
    startFileName = data.nextFileName
  }

  return files
}

export async function getDownloadUrl(fileName: string): Promise<string> {
  const auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME?.trim()
  if (!bucketName) throw new Error('B2_BUCKET_NAME is not configured')
  return `${auth.downloadUrl}/file/${bucketName}/${encodeB2Path(fileName)}`
}

export async function getSignedDownloadUrl(fileName: string, duration: number = 3600): Promise<string> {
  void duration
  return `/api/upload/download?file=${encodeURIComponent(fileName)}`
}

export async function downloadFile(fileName: string): Promise<{ data: Buffer; contentType: string }> {
  let auth = await getAuth()
  const bucketName = process.env.B2_BUCKET_NAME?.trim()
  if (!bucketName) throw new Error('B2_BUCKET_NAME is not configured')
  const url = () => `${auth.downloadUrl}/file/${bucketName}/${encodeB2Path(fileName)}`

  let res = await fetch(url(), { headers: { Authorization: auth.authorizationToken }, cache: 'no-store' })
  if (res.status === 401) {
    invalidateAuth()
    auth = await getAuth(true)
    res = await fetch(url(), { headers: { Authorization: auth.authorizationToken }, cache: 'no-store' })
  }
  if (!res.ok) throw new Error(`Failed to download file from B2 (${res.status})`)
  return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/octet-stream' }
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
