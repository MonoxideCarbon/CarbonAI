export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  personality: 'humanoid' | 'professional';
  theme: 'light' | 'dark' | 'amoled' | 'system';
  memory_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: Attachment[];
  model_used?: string;
  sources?: SearchSource[];
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  public_url?: string;
}

export interface Memory {
  id: string;
  user_id: string;
  key: string;
  value: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface AIModel {
  id: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  name: string;
  capabilities: ModelCapabilities;
  contextLimit: number;
  isFree: boolean;
  isHealthy: boolean;
  avgLatency: number;
}

export interface ModelCapabilities {
  chat: boolean;
  vision: boolean;
  reasoning: boolean;
  coding: boolean;
  documents: boolean;
  largeContext: boolean;
}

export interface ProviderHealth {
  provider: string;
  model: string;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  avgLatencyMs: number;
  lastError?: string;
  lastUsed: string;
  isHealthy: boolean;
}

export type Theme = 'light' | 'dark' | 'amoled' | 'system';
export type Personality = 'humanoid' | 'professional';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name?: string;
  avatar_url?: string;
  personality: 'humanoid' | 'professional';
  theme: 'light' | 'dark' | 'amoled' | 'system';
  memory_enabled: boolean | number;
  email_verified: boolean | number;
  verification_token?: string;
  reset_token?: string;
  reset_expires?: string;
  created_at: string;
  updated_at: string;
}

