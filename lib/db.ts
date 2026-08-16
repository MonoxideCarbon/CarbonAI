import Database from 'libsql'

let db: any = null
let initialized = false

export function getDb(): any {
  if (db) return db

  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('Database is not supported in Edge Runtime.')
  }

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim()

  if (process.env.VERCEL && (!tursoUrl || !tursoToken)) {
    throw new Error('Turso database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.')
  }

  if (tursoUrl) {
    db = new Database(tursoUrl, { authToken: tursoToken })
  } else {
    // Local development fallback. This keeps the project runnable without a Turso account.
    const path = require('path')
    const fs = require('fs')
    const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'carbonai.db')
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    db = new Database(DB_PATH)
    try { db.pragma('journal_mode = WAL') } catch {}
  }

  try { db.pragma('foreign_keys = ON') } catch {}
  initTables()
  return db
}

function initTables() {
  if (initialized) return
  const database = db || getDb()

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      avatar_url TEXT,
      personality TEXT DEFAULT 'humanoid' CHECK (personality IN ('humanoid', 'professional')),
      theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'amoled', 'system')),
      memory_enabled INTEGER DEFAULT 1,
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_expires TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT DEFAULT 'New Chat',
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      model_used TEXT,
      sources TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      b2_file_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_health (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      timeout_count INTEGER DEFAULT 0,
      avg_latency_ms INTEGER DEFAULT 0,
      last_error TEXT,
      last_used TEXT DEFAULT (datetime('now')),
      is_healthy INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, model)
    );

    CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_chat ON attachments(chat_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);
  `)

  initialized = true
}

export function queryOne<T>(sql: string, params?: any[]): T | undefined {
  return getDb().prepare(sql).get(...(params || [])) as T | undefined
}

export function queryAll<T>(sql: string, params?: any[]): T[] {
  return getDb().prepare(sql).all(...(params || [])) as T[]
}

export function runQuery(sql: string, params?: any[]): any {
  return getDb().prepare(sql).run(...(params || []))
}
