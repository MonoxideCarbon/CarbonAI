import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { downloadAttachment } from '@/lib/db'
import type { AIModel, Message } from '@/types'

let geminiClient: GoogleGenerativeAI | null = null
let groqClient: Groq | null = null
let openRouterClient: OpenAI | null = null

function getGeminiClient() {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY?.trim()
    if (!key) throw new Error('GEMINI_API_KEY is not configured')
    geminiClient = new GoogleGenerativeAI(key)
  }
  return geminiClient
}
function getGroqClient() {
  if (!groqClient) {
    const key = process.env.GROQ_API_KEY?.trim()
    if (!key) throw new Error('GROQ_API_KEY is not configured')
    groqClient = new Groq({ apiKey: key })
  }
  return groqClient
}
function getOpenRouterClient() {
  if (!openRouterClient) {
    const key = process.env.OPENROUTER_API_KEY?.trim()
    if (!key) throw new Error('OPENROUTER_API_KEY is not configured')
    openRouterClient = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key, defaultHeaders: { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://carbonai-private.vercel.app', 'X-Title': 'CarbonAI-Private' } })
  }
  return openRouterClient
}

const MODELS: AIModel[] = [
  { id: 'gemini-2.5-flash', provider: 'gemini', name: 'Gemini 2.5 Flash', capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true }, contextLimit: 1_048_576, isFree: false, isHealthy: true, avgLatency: 0 },
  { id: 'gemini-2.5-flash-lite', provider: 'gemini', name: 'Gemini 2.5 Flash-Lite', capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true }, contextLimit: 1_048_576, isFree: false, isHealthy: true, avgLatency: 0 },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', name: 'Llama 3.3 70B', capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true }, contextLimit: 131_072, isFree: false, isHealthy: true, avgLatency: 0 },
  { id: 'openai/gpt-oss-120b', provider: 'groq', name: 'GPT OSS 120B', capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true }, contextLimit: 131_072, isFree: false, isHealthy: true, avgLatency: 0 },
  { id: 'llama-3.1-8b-instant', provider: 'groq', name: 'Llama 3.1 8B Instant', capabilities: { chat: true, vision: false, reasoning: false, coding: true, documents: false, largeContext: true }, contextLimit: 131_072, isFree: false, isHealthy: true, avgLatency: 0 },
  { id: 'openrouter/free', provider: 'openrouter', name: 'OpenRouter Free Router', capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true }, contextLimit: 128_000, isFree: true, isHealthy: true, avgLatency: 0 },
]

function providerConfigured(provider: AIModel['provider']): boolean {
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY?.trim())
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY?.trim())
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}
let modelHealthCache = new Map<string, AIModel>()
let lastHealthRefresh = 0
const HEALTH_REFRESH_INTERVAL = 5 * 60 * 1000
export function getHealthCache(): Map<string, AIModel> {
  const now = Date.now()
  if (modelHealthCache.size === 0 || now - lastHealthRefresh >= HEALTH_REFRESH_INTERVAL) {
    modelHealthCache = new Map(MODELS.map(model => [model.id, { ...model, isHealthy: model.isHealthy && providerConfigured(model.provider), capabilities: { ...model.capabilities } }]))
    lastHealthRefresh = now
  }
  return modelHealthCache
}
export function markModelUnhealthy(modelId: string, error?: string) { const model = getHealthCache().get(modelId); if (!model) return; model.isHealthy = false; model.avgLatency = Number.POSITIVE_INFINITY; console.warn(`[CarbonAI] Model ${modelId} marked unhealthy: ${error || 'unknown error'}`) }
export function markModelHealthy(modelId: string, latencyMs: number) { const model = getHealthCache().get(modelId); if (!model || !providerConfigured(model.provider)) return; model.isHealthy = true; model.avgLatency = latencyMs }
export function estimateTokens(text: string): number { return Math.max(0, Math.ceil(text.length / 4)) }

function analyzeRequest(messages: Message[], hasImages: boolean, hasDocuments: boolean, estimatedTokens: number) {
  const content = messages[messages.length - 1]?.content?.toLowerCase() || ''
  const coding = /\b(code|program|function|script|debug|error|python|javascript|typescript|react|html|css|sql|api|json|xml)\b/.test(content) || content.includes('```')
  const reasoning = /\b(explain|analyze|compare|evaluate|reason|complex|mathematical|prove|solve|logic)\b/.test(content) || content.length > 500
  return { chat: true, vision: hasImages, reasoning, coding, documents: hasDocuments, needsLargeContext: estimatedTokens > 32_000 || messages.length > 20 }
}
function scoreModel(model: AIModel, requirements: ReturnType<typeof analyzeRequest>): number {
  if (!model.isHealthy) return -100_000
  let score = 0
  if (requirements.vision && !model.capabilities.vision) score -= 50_000
  if (requirements.documents && !model.capabilities.documents) score -= 20_000
  if (requirements.coding && model.capabilities.coding) score += 250
  if (requirements.reasoning && model.capabilities.reasoning) score += 250
  if (requirements.needsLargeContext && model.capabilities.largeContext) score += 300
  if (requirements.needsLargeContext && model.contextLimit < 64_000) score -= 300
  if (model.provider === 'gemini' && (requirements.vision || requirements.documents || requirements.needsLargeContext)) score += 700
  if (Number.isFinite(model.avgLatency) && model.avgLatency > 0) score -= model.avgLatency / 100
  score += model.contextLimit / 10_000
  return score
}
export function selectModel(messages: Message[], hasImages = false, hasDocuments = false, estimatedTokenCount = 0): AIModel | null {
  const requirements = analyzeRequest(messages, hasImages, hasDocuments, estimatedTokenCount)
  return Array.from(getHealthCache().values()).sort((a, b) => scoreModel(b, requirements) - scoreModel(a, requirements))[0] || null
}
export function getFailoverModels(primaryModel: AIModel): AIModel[] {
  return Array.from(getHealthCache().values()).filter(model => model.id !== primaryModel.id && model.isHealthy).sort((a, b) => {
    const penaltyA = a.provider === primaryModel.provider ? 100 : 0
    const penaltyB = b.provider === primaryModel.provider ? 100 : 0
    const baseline = { chat: true, vision: primaryModel.capabilities.vision, reasoning: true, coding: true, documents: primaryModel.capabilities.documents, needsLargeContext: false }
    return (scoreModel(b, baseline) - penaltyB) - (scoreModel(a, baseline) - penaltyA)
  })
}

export async function* generateResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature = 0.7): AsyncGenerator<string, void, unknown> {
  const start = Date.now()
  try {
    if (model.provider === 'gemini') yield* generateGeminiResponse(model, messages, systemPrompt, temperature)
    else if (model.provider === 'groq') yield* generateGroqResponse(model, messages, systemPrompt, temperature)
    else yield* generateOpenRouterResponse(model, messages, systemPrompt, temperature)
    markModelHealthy(model.id, Date.now() - start)
  } catch (error) {
    markModelUnhealthy(model.id, error instanceof Error ? error.message : 'unknown error')
    throw error
  }
}

async function readAttachmentText(message: Message): Promise<string> {
  const parts: string[] = []
  for (const attachment of message.attachments || []) {
    if (attachment.file_type?.startsWith('image/') || attachment.file_type === 'application/pdf') continue
    try {
      const { data } = await downloadAttachment(message.user_id, attachment.storage_path)
      const text = data.toString('utf8').slice(0, 120_000)
      if (text.trim()) parts.push(`\n\nAttachment: ${attachment.filename}\n${text}`)
    } catch (error) { console.warn(`[CarbonAI] Unable to read ${attachment.filename}:`, error) }
  }
  return parts.join('')
}
async function geminiParts(message: Message): Promise<any[]> {
  const parts: any[] = []
  if (message.content) parts.push({ text: message.content })
  for (const attachment of message.attachments || []) {
    try {
      const { data } = await downloadAttachment(message.user_id, attachment.storage_path)
      const mime = attachment.file_type || 'application/octet-stream'
      if (mime.startsWith('image/') || mime === 'application/pdf') parts.push({ inlineData: { mimeType: mime, data: data.toString('base64') } })
      else {
        const text = data.toString('utf8').slice(0, 120_000)
        if (text.trim()) parts.push({ text: `Attachment: ${attachment.filename}\n${text}` })
      }
    } catch (error) { parts.push({ text: `Attachment ${attachment.filename} could not be read.` }); console.warn(`[CarbonAI] Attachment read failed: ${attachment.filename}`, error) }
  }
  return parts
}
async function* generateGeminiResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const genModel = getGeminiClient().getGenerativeModel({ model: model.id, systemInstruction: systemPrompt, generationConfig: { ...(model.id.startsWith('gemini-3.') ? {} : { temperature }), maxOutputTokens: 8192 } })
  const history: any[] = []
  for (const message of messages.slice(0, -1)) history.push({ role: message.role === 'user' ? 'user' : 'model', parts: await geminiParts(message) })
  const result = await genModel.startChat({ history }).sendMessageStream(await geminiParts(messages[messages.length - 1]))
  for await (const chunk of result.stream) { const text = chunk.text(); if (text) yield text }
}
async function* generateGroqResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const mapped = await Promise.all(messages.map(async message => ({ role: message.role as 'user' | 'assistant' | 'system', content: `${message.content || ''}${await readAttachmentText(message)}` })))
  const stream = await getGroqClient().chat.completions.create({ model: model.id, messages: [{ role: 'system', content: systemPrompt }, ...mapped], temperature, max_tokens: 4096, stream: true })
  for await (const chunk of stream) { const content = chunk.choices[0]?.delta?.content; if (content) yield content }
}
async function* generateOpenRouterResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const mapped = await Promise.all(messages.map(async message => ({ role: message.role as 'user' | 'assistant' | 'system', content: `${message.content || ''}${await readAttachmentText(message)}` })))
  const stream = await getOpenRouterClient().chat.completions.create({ model: model.id, messages: [{ role: 'system', content: systemPrompt }, ...mapped], temperature, max_tokens: 4096, stream: true })
  for await (const chunk of stream) { const content = chunk.choices[0]?.delta?.content; if (content) yield content }
}

export function buildSystemPrompt(personality: 'humanoid' | 'professional', memories: Array<{ key: string; value: string }>, webContext = ''): string {
  const base = personality === 'humanoid'
    ? 'You are CarbonAI-Private, a helpful AI assistant. Be friendly, natural, concise, supportive, and human-like. You can inspect user attachments including images, PDFs, code and text. Treat image pixels as authoritative input when an image is attached. Carefully answer questions about visible text, diagrams, screenshots, charts, UI, handwriting, and code shown in images. Never claim you saw an attachment unless it was supplied. Do not reveal which underlying model or provider you use. If asked, say: "I\'m CarbonAI-Private. I automatically choose the most suitable AI system for each request."'
    : 'You are CarbonAI-Private, a professional AI assistant. Be precise, direct, well-structured, and concise. You can inspect user attachments including images, PDFs, code and text. Treat image pixels as authoritative input when an image is attached. Carefully answer questions about visible text, diagrams, screenshots, charts, handwriting, and code shown in images. Never claim you saw an attachment unless it was supplied. Do not reveal which underlying model or provider you use. If asked, say: "I\'m CarbonAI-Private. I automatically choose the most suitable AI system for each request."'
  const memoryText = memories.length ? `\n\nRelevant information about the user:\n${memories.map(memory => `- ${memory.key}: ${memory.value}`).join('\n')}` : ''
  const webText = webContext ? `\n\nLIVE WEB CONTEXT:\n${webContext}\n\nUse these sources as evidence. Do not invent facts that are not supported by the supplied sources. Mention the source URL when useful.` : ''
  return `${base}${memoryText}${webText}`
}
