import crypto from 'crypto'
import type { Chat, Memory, Message, User } from '@/types'
import { getSupabaseAdmin, getSupabaseBucket } from '@/lib/supabase-admin'

function now() { return new Date().toISOString() }

function normalizeUser(row: any): User {
  return {
    id: String(row.id),
    email: String(row.email),
    password_hash: String(row.password_hash),
    full_name: row.full_name ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    personality: row.personality || 'humanoid',
    theme: row.theme || 'system',
    memory_enabled: Boolean(row.memory_enabled),
    email_verified: Boolean(row.email_verified),
    verification_token: row.verification_token ?? undefined,
    reset_token: row.reset_token ?? undefined,
    reset_expires: row.reset_expires ?? undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function normalizeChat(row: any): Chat {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title || 'New Chat'),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function normalizeMessage(row: any): Message {
  return {
    id: String(row.id),
    chat_id: String(row.chat_id),
    user_id: String(row.user_id),
    role: row.role,
    content: String(row.content || ''),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    model_used: row.model_used ?? undefined,
    sources: Array.isArray(row.sources) ? row.sources : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function normalizeMemory(row: any): Memory {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    key: String(row.key),
    value: String(row.value),
    category: String(row.category || 'general'),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('users').select('*').eq('email', email.trim().toLowerCase()).maybeSingle()
  if (error) throw new Error(`Supabase user lookup failed: ${error.message}`)
  return data ? normalizeUser(data) : undefined
}

export async function getUserById(id: string): Promise<User | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Supabase user lookup failed: ${error.message}`)
  return data ? normalizeUser(data) : undefined
}

export async function createUser(data: { id: string; email: string; password_hash: string; full_name?: string; verification_token?: string }): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('users').insert({
    id: data.id,
    email: data.email.trim().toLowerCase(),
    password_hash: data.password_hash,
    full_name: data.full_name || null,
    personality: 'humanoid',
    theme: 'system',
    memory_enabled: true,
    email_verified: true,
    verification_token: data.verification_token || null,
    created_at: now(),
    updated_at: now(),
  })
  if (error) throw new Error(`Supabase user creation failed: ${error.message}`)
}

export async function deleteUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: files } = await supabase.from('attachments').select('storage_path').eq('user_id', userId)
  const paths = (files || []).map(file => file.storage_path).filter(Boolean)
  if (paths.length) await supabase.storage.from(getSupabaseBucket()).remove(paths)

  const { error } = await supabase.from('users').delete().eq('id', userId)
  if (error) throw new Error(`Supabase account deletion failed: ${error.message}`)
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
  const supabase = getSupabaseAdmin()
  const allowed = ['full_name', 'avatar_url', 'personality', 'theme', 'memory_enabled'] as const
  const patch: Record<string, unknown> = { updated_at: now() }
  for (const key of allowed) if (key in updates) patch[key] = (updates as any)[key]
  const { data, error } = await supabase.from('users').update(patch).eq('id', userId).select('*').maybeSingle()
  if (error) throw new Error(`Supabase user update failed: ${error.message}`)
  return data ? normalizeUser(data) : undefined
}

export async function verifyUserEmail(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data: user, error } = await supabase.from('users').select('*').eq('verification_token', token).maybeSingle()
  if (error) throw new Error(`Supabase verification lookup failed: ${error.message}`)
  if (!user) return false
  const { error: updateError } = await supabase.from('users').update({ email_verified: true, verification_token: null, updated_at: now() }).eq('id', user.id)
  if (updateError) throw new Error(`Supabase email verification failed: ${updateError.message}`)
  return true
}

export async function setResetToken(email: string, token: string, expires: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: user, error: lookupError } = await supabase.from('users').select('id').eq('email', email.trim().toLowerCase()).maybeSingle()
  if (lookupError) throw new Error(`Supabase reset lookup failed: ${lookupError.message}`)
  if (!user) return
  const { error } = await supabase.from('users').update({ reset_token: token, reset_expires: expires, updated_at: now() }).eq('id', user.id)
  if (error) throw new Error(`Supabase reset token update failed: ${error.message}`)
}

export async function resetPassword(token: string, passwordHash: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data: user, error: lookupError } = await supabase.from('users').select('id, reset_expires').eq('reset_token', token).maybeSingle()
  if (lookupError) throw new Error(`Supabase reset lookup failed: ${lookupError.message}`)
  if (!user || !user.reset_expires || new Date(user.reset_expires).getTime() <= Date.now()) return false
  const { error } = await supabase.from('users').update({ password_hash: passwordHash, reset_token: null, reset_expires: null, updated_at: now() }).eq('id', user.id)
  if (error) throw new Error(`Supabase password reset failed: ${error.message}`)
  return true
}

export async function createChat(userId: string): Promise<Chat> {
  const chat: Chat = { id: crypto.randomUUID(), user_id: userId, title: 'New Chat', pinned: false, archived: false, created_at: now(), updated_at: now() }
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('chats').insert(chat)
  if (error) throw new Error(`Supabase chat creation failed: ${error.message}`)
  return chat
}

export async function getChat(userId: string, chatId: string): Promise<Chat | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('chats').select('*').eq('id', chatId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Supabase chat lookup failed: ${error.message}`)
  return data ? normalizeChat(data) : undefined
}

export async function listChats(userId: string): Promise<Chat[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('chats').select('*').eq('user_id', userId).eq('archived', false).order('pinned', { ascending: false }).order('updated_at', { ascending: false })
  if (error) throw new Error(`Supabase chat list failed: ${error.message}`)
  return (data || []).map(normalizeChat)
}

export async function updateChat(userId: string, chatId: string, updates: Partial<Chat>): Promise<Chat | undefined> {
  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: now() }
  for (const key of ['title', 'pinned', 'archived'] as const) if (key in updates) patch[key] = (updates as any)[key]
  const { data, error } = await supabase.from('chats').update(patch).eq('id', chatId).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw new Error(`Supabase chat update failed: ${error.message}`)
  return data ? normalizeChat(data) : undefined
}

export async function deleteChat(userId: string, chatId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: files } = await supabase.from('attachments').select('storage_path').eq('user_id', userId).eq('chat_id', chatId)
  const paths = (files || []).map(file => file.storage_path).filter(Boolean)
  if (paths.length) await supabase.storage.from(getSupabaseBucket()).remove(paths)
  const { error } = await supabase.from('chats').delete().eq('id', chatId).eq('user_id', userId)
  if (error) throw new Error(`Supabase chat deletion failed: ${error.message}`)
}

export async function listMessages(userId: string, chatId: string): Promise<Message[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).eq('user_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw new Error(`Supabase message list failed: ${error.message}`)
  return (data || []).map(normalizeMessage)
}

export async function saveMessage(message: Message): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('messages').upsert({
    id: message.id,
    chat_id: message.chat_id,
    user_id: message.user_id,
    role: message.role,
    content: message.content || '',
    attachments: message.attachments || [],
    model_used: message.model_used || null,
    sources: message.sources || [],
    created_at: message.created_at || now(),
    updated_at: now(),
  })
  if (error) throw new Error(`Supabase message save failed: ${error.message}`)
}

export async function getMessage(userId: string, chatId: string, messageId: string): Promise<Message | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('messages').select('*').eq('id', messageId).eq('chat_id', chatId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Supabase message lookup failed: ${error.message}`)
  return data ? normalizeMessage(data) : undefined
}

export async function updateMessage(userId: string, chatId: string, messageId: string, updates: Partial<Message>): Promise<Message | undefined> {
  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: now() }
  for (const key of ['content', 'model_used', 'attachments', 'sources'] as const) if (key in updates) patch[key] = (updates as any)[key]
  const { data, error } = await supabase.from('messages').update(patch).eq('id', messageId).eq('chat_id', chatId).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw new Error(`Supabase message update failed: ${error.message}`)
  return data ? normalizeMessage(data) : undefined
}

export async function listMemories(userId: string): Promise<Memory[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('memories').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw new Error(`Supabase memory list failed: ${error.message}`)
  return (data || []).map(normalizeMemory)
}

export async function getMemory(userId: string, memoryId: string): Promise<Memory | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('memories').select('*').eq('id', memoryId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Supabase memory lookup failed: ${error.message}`)
  return data ? normalizeMemory(data) : undefined
}

export async function upsertMemory(userId: string, key: string, value: string): Promise<Memory> {
  const existing = (await listMemories(userId)).find(memory => memory.key === key)
  const memory: Memory = existing
    ? { ...existing, value, updated_at: now() }
    : { id: crypto.randomUUID(), user_id: userId, key, value, category: 'general', created_at: now(), updated_at: now() }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('memories').upsert({ ...memory }).select('*').single()
  if (error) throw new Error(`Supabase memory save failed: ${error.message}`)
  return normalizeMemory(data)
}

export async function updateMemory(userId: string, memoryId: string, updates: Partial<Memory>): Promise<Memory | undefined> {
  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: now() }
  for (const key of ['key', 'value', 'category'] as const) if (key in updates) patch[key] = (updates as any)[key]
  const { data, error } = await supabase.from('memories').update(patch).eq('id', memoryId).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw new Error(`Supabase memory update failed: ${error.message}`)
  return data ? normalizeMemory(data) : undefined
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('memories').delete().eq('id', memoryId).eq('user_id', userId)
  if (error) throw new Error(`Supabase memory deletion failed: ${error.message}`)
}

export async function deleteAllMemories(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('memories').delete().eq('user_id', userId)
  if (error) throw new Error(`Supabase memory deletion failed: ${error.message}`)
}

export async function saveAttachment(userId: string, value: any): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('attachments').upsert({
    id: value.id,
    user_id: userId,
    chat_id: value.chat_id || null,
    filename: value.filename,
    file_type: value.file_type || 'application/octet-stream',
    file_size: value.file_size || 0,
    storage_path: value.storage_path,
    created_at: value.created_at || now(),
  })
  if (error) throw new Error(`Supabase attachment save failed: ${error.message}`)
}

export async function listAttachments(userId: string): Promise<any[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('attachments').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw new Error(`Supabase attachment list failed: ${error.message}`)
  return data || []
}

export async function findAttachmentByStoragePath(userId: string, storagePath: string): Promise<any | undefined> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('attachments').select('*').eq('user_id', userId).eq('storage_path', storagePath).maybeSingle()
  if (error) throw new Error(`Supabase attachment lookup failed: ${error.message}`)
  return data || undefined
}

export async function exportUserData(userId: string): Promise<{ chats: Chat[]; messages: Message[]; memories: Memory[] }> {
  const [chats, messages, memories] = await Promise.all([listChats(userId), getAllMessages(userId), listMemories(userId)])
  return { chats, messages, memories }
}

async function getAllMessages(userId: string): Promise<Message[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('messages').select('*').eq('user_id', userId).order('created_at', { ascending: true })
  if (error) throw new Error(`Supabase message export failed: ${error.message}`)
  return (data || []).map(normalizeMessage)
}

export async function getStorageHealth(): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const [dbResult, storageResult] = await Promise.all([
    supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1),
    supabase.storage.from(getSupabaseBucket()).list('', { limit: 1 }),
  ])
  if (dbResult.error) throw new Error(`Supabase database health check failed: ${dbResult.error.message}`)
  if (storageResult.error) throw new Error(`Supabase storage health check failed: ${storageResult.error.message}`)
  return true
}
