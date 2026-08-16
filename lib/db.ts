import crypto from 'crypto'
import { deleteLatestFile, downloadJson, listFiles, uploadJson } from '@/lib/backblaze'
import type { Chat, Memory, Message, User } from '@/types'

const ROOT = 'carbonai/v1'

function userPath(id: string) { return `${ROOT}/users/${id}.json` }
function emailPath(email: string) {
  const normalized = email.trim().toLowerCase()
  return `${ROOT}/email-index/${crypto.createHash('sha256').update(normalized).digest('hex')}.json`
}
function chatPath(userId: string, chatId: string) { return `${ROOT}/users/${userId}/chats/${chatId}.json` }
function messagePath(userId: string, chatId: string, messageId: string) { return `${ROOT}/users/${userId}/messages/${chatId}/${messageId}.json` }
function memoryPath(userId: string, memoryId: string) { return `${ROOT}/users/${userId}/memories/${memoryId}.json` }
function attachmentPath(userId: string, attachmentId: string) { return `${ROOT}/users/${userId}/attachments/${attachmentId}.json` }
function now() { return new Date().toISOString() }

async function put<T>(path: string, value: T): Promise<void> { await uploadJson(path, value) }

async function remove(path: string): Promise<void> {
  try { await deleteLatestFile(path) } catch (error: any) {
    if (!String(error?.message || '').includes('(404)')) throw error
  }
}

async function listJson<T>(prefix: string): Promise<T[]> {
  const files = await listFiles(prefix, 1000)
  const results: T[] = []
  for (const file of files) {
    const value = await downloadJson<T>(file.fileName)
    if (value) results.push(value)
  }
  return results
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const id = await downloadJson<{ userId: string }>(emailPath(email))
  if (!id?.userId) return undefined
  return getUserById(id.userId)
}

export async function getUserById(id: string): Promise<User | undefined> {
  return (await downloadJson<User>(userPath(id))) || undefined
}

export async function createUser(data: { id: string; email: string; password_hash: string; full_name?: string; verification_token?: string }): Promise<void> {
  const stamp = now()
  const user: User = {
    id: data.id,
    email: data.email.toLowerCase().trim(),
    password_hash: data.password_hash,
    full_name: data.full_name || undefined,
    personality: 'humanoid',
    theme: 'system',
    memory_enabled: 1,
    email_verified: 1,
    verification_token: data.verification_token,
    created_at: stamp,
    updated_at: stamp,
  }
  await put(userPath(user.id), user)
  await put(emailPath(user.email), { userId: user.id })
}

export async function deleteUser(userId: string): Promise<void> {
  const user = await getUserById(userId)
  if (user) await remove(emailPath(user.email))
  const [chats, messages, memories, attachments] = await Promise.all([
    listJson<Chat>(`${ROOT}/users/${userId}/chats/`),
    listJson<Message>(`${ROOT}/users/${userId}/messages/`),
    listJson<Memory>(`${ROOT}/users/${userId}/memories/`),
    listJson<any>(`${ROOT}/users/${userId}/attachments/`),
  ])
  await Promise.all([
    ...chats.map(c => remove(chatPath(userId, c.id))),
    ...messages.map(m => remove(messagePath(userId, m.chat_id, m.id))),
    ...memories.map(m => remove(memoryPath(userId, m.id))),
    ...attachments.map(a => remove(attachmentPath(userId, a.id))),
    remove(userPath(userId)),
  ])
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
  const user = await getUserById(userId)
  if (!user) return undefined
  const allowed = ['full_name', 'avatar_url', 'personality', 'theme', 'memory_enabled'] as const
  for (const key of allowed) if (key in updates) (user as any)[key] = (updates as any)[key]
  user.updated_at = now()
  await put(userPath(userId), user)
  return user
}

export async function verifyUserEmail(token: string): Promise<boolean> {
  const users = await listJson<User>(`${ROOT}/users/`)
  const user = users.find(u => u.verification_token === token)
  if (!user) return false
  user.email_verified = 1
  delete user.verification_token
  user.updated_at = now()
  await put(userPath(user.id), user)
  return true
}

export async function setResetToken(email: string, token: string, expires: string): Promise<void> {
  const user = await getUserByEmail(email)
  if (!user) return
  user.reset_token = token
  user.reset_expires = expires
  user.updated_at = now()
  await put(userPath(user.id), user)
}

export async function resetPassword(token: string, passwordHash: string): Promise<boolean> {
  const users = await listJson<User>(`${ROOT}/users/`)
  const user = users.find(u => u.reset_token === token && !!u.reset_expires && u.reset_expires > now())
  if (!user) return false
  user.password_hash = passwordHash
  delete user.reset_token
  delete user.reset_expires
  user.updated_at = now()
  await put(userPath(user.id), user)
  return true
}

export async function createChat(userId: string): Promise<Chat> {
  const stamp = now()
  const chat: Chat = { id: crypto.randomUUID(), user_id: userId, title: 'New Chat', pinned: false, archived: false, created_at: stamp, updated_at: stamp }
  await put(chatPath(userId, chat.id), chat)
  return chat
}

export async function getChat(userId: string, chatId: string): Promise<Chat | undefined> {
  return (await downloadJson<Chat>(chatPath(userId, chatId))) || undefined
}

export async function listChats(userId: string): Promise<Chat[]> {
  const chats = await listJson<Chat>(`${ROOT}/users/${userId}/chats/`)
  return chats.filter(c => !c.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
}

export async function updateChat(userId: string, chatId: string, updates: Partial<Chat>): Promise<Chat | undefined> {
  const chat = await getChat(userId, chatId)
  if (!chat) return undefined
  Object.assign(chat, updates, { updated_at: now() })
  await put(chatPath(userId, chatId), chat)
  return chat
}

export async function deleteChat(userId: string, chatId: string): Promise<void> {
  const [messages, attachments] = await Promise.all([listMessages(userId, chatId), listJson<any>(`${ROOT}/users/${userId}/attachments/` )])
  await Promise.all([
    remove(chatPath(userId, chatId)),
    ...messages.map(m => remove(messagePath(userId, chatId, m.id))),
    ...attachments.filter(a => a.chat_id === chatId).map(a => remove(attachmentPath(userId, a.id))),
  ])
}

export async function listMessages(userId: string, chatId: string): Promise<Message[]> {
  const messages = await listJson<Message>(`${ROOT}/users/${userId}/messages/${chatId}/`)
  return messages.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export async function saveMessage(message: Message): Promise<void> {
  await put(messagePath(message.user_id, message.chat_id, message.id), {
    ...message,
    attachments: message.attachments || [],
    sources: message.sources || [],
    created_at: message.created_at || now(),
    updated_at: message.updated_at || now(),
  })
}

export async function getMessage(userId: string, chatId: string, messageId: string): Promise<Message | undefined> {
  return (await downloadJson<Message>(messagePath(userId, chatId, messageId))) || undefined
}

export async function updateMessage(userId: string, chatId: string, messageId: string, updates: Partial<Message>): Promise<Message | undefined> {
  const message = await getMessage(userId, chatId, messageId)
  if (!message) return undefined
  Object.assign(message, updates, { updated_at: now() })
  await put(messagePath(userId, chatId, messageId), message)
  return message
}

export async function listMemories(userId: string): Promise<Memory[]> {
  const memories = await listJson<Memory>(`${ROOT}/users/${userId}/memories/`)
  return memories.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getMemory(userId: string, memoryId: string): Promise<Memory | undefined> {
  return (await downloadJson<Memory>(memoryPath(userId, memoryId))) || undefined
}

export async function upsertMemory(userId: string, key: string, value: string): Promise<Memory> {
  const memories = await listMemories(userId)
  const existing = memories.find(m => m.key === key)
  const stamp = now()
  const memory: Memory = existing ? { ...existing, value, updated_at: stamp } : { id: crypto.randomUUID(), user_id: userId, key, value, category: 'general', created_at: stamp, updated_at: stamp }
  await put(memoryPath(userId, memory.id), memory)
  return memory
}

export async function updateMemory(userId: string, memoryId: string, updates: Partial<Memory>): Promise<Memory | undefined> {
  const memory = await getMemory(userId, memoryId)
  if (!memory) return undefined
  Object.assign(memory, updates, { updated_at: now() })
  await put(memoryPath(userId, memoryId), memory)
  return memory
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> { await remove(memoryPath(userId, memoryId)) }

export async function deleteAllMemories(userId: string): Promise<void> {
  const memories = await listMemories(userId)
  await Promise.all(memories.map(m => remove(memoryPath(userId, m.id))))
}

export async function saveAttachment(userId: string, value: any): Promise<void> { await put(attachmentPath(userId, value.id), value) }
export async function listAttachments(userId: string): Promise<any[]> { return listJson<any>(`${ROOT}/users/${userId}/attachments/`) }
export async function findAttachmentByStoragePath(userId: string, storagePath: string): Promise<any | undefined> { return (await listAttachments(userId)).find(a => a.storage_path === storagePath) }

export async function exportUserData(userId: string): Promise<{ chats: Chat[]; messages: Message[]; memories: Memory[] }> {
  const [chats, messages, memories] = await Promise.all([
    listJson<Chat>(`${ROOT}/users/${userId}/chats/`),
    listJson<Message>(`${ROOT}/users/${userId}/messages/`),
    listJson<Memory>(`${ROOT}/users/${userId}/memories/`),
  ])
  return { chats, messages, memories }
}

export async function getStorageHealth(): Promise<boolean> {
  await put(`${ROOT}/health.json`, { ok: true, updatedAt: now() })
  return true
}
