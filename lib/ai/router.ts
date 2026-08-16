import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import OpenAI from 'openai'
import type { AIModel, Message, ModelCapabilities } from '@/types'

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
    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://carbonai-private.vercel.app',
        'X-Title': 'CarbonAI-Private',
      },
    })
  }
  return openRouterClient
}

const MODELS: AIModel[] = [
  {
    id: 'gemini-3.5-flash',
    provider: 'gemini',
    name: 'Gemini 3.5 Flash',
    capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true },
    contextLimit: 1_000_000,
    isFree: false,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    name: 'Gemini 3.5 Flash-Lite',
    capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true },
    contextLimit: 1_000_000,
    isFree: false,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    name: 'Llama 3.3 70B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 131_072,
    isFree: false,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    name: 'GPT OSS 120B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 131_072,
    isFree: false,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    name: 'Llama 3.1 8B Instant',
    capabilities: { chat: true, vision: false, reasoning: false, coding: true, documents: false, largeContext: true },
    contextLimit: 131_072,
    isFree: false,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'openrouter/free',
    provider: 'openrouter',
    name: 'OpenRouter Free Router',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 128_000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
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
    modelHealthCache = new Map(MODELS.map(model => [model.id, {
      ...model,
      isHealthy: model.isHealthy && providerConfigured(model.provider),
      capabilities: { ...model.capabilities },
    }]))
    lastHealthRefresh = now
  }
  return modelHealthCache
}

export function markModelUnhealthy(modelId: string, error?: string) {
  const model = getHealthCache().get(modelId)
  if (!model) return
  model.isHealthy = false
  model.avgLatency = Number.POSITIVE_INFINITY
  console.warn(`[CarbonAI] Model ${modelId} marked unhealthy: ${error || 'unknown error'}`)
}

export function markModelHealthy(modelId: string, latencyMs: number) {
  const model = getHealthCache().get(modelId)
  if (!model || !providerConfigured(model.provider)) return
  model.isHealthy = true
  model.avgLatency = latencyMs
}

export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4))
}

function analyzeRequest(messages: Message[], hasImages: boolean, hasDocuments: boolean, estimatedTokens: number) {
  const content = messages[messages.length - 1]?.content?.toLowerCase() || ''
  const coding = /\b(code|program|function|script|debug|error|python|javascript|typescript|react|html|css|sql|api|json|xml)\b/.test(content) || content.includes('```')
  const reasoning = /\b(explain|analyze|compare|evaluate|reason|complex|mathematical|prove|solve|logic)\b/.test(content) || content.length > 500
  return {
    chat: true,
    vision: hasImages,
    reasoning,
    coding,
    documents: hasDocuments,
    needsLargeContext: estimatedTokens > 32_000 || messages.length > 20,
  }
}

function scoreModel(model: AIModel, requirements: ReturnType<typeof analyzeRequest>): number {
  if (!model.isHealthy) return -100_000
  let score = 0
  if (requirements.vision && !model.capabilities.vision) score -= 5_000
  if (requirements.documents && !model.capabilities.documents) score -= 1_000
  if (requirements.coding && model.capabilities.coding) score += 250
  if (requirements.reasoning && model.capabilities.reasoning) score += 250
  if (requirements.needsLargeContext && model.capabilities.largeContext) score += 300
  if (requirements.needsLargeContext && model.contextLimit < 64_000) score -= 300
  if (model.provider === 'gemini' && !requirements.needsLargeContext) score += 100
  if (model.provider === 'openrouter' && model.isFree) score += 20
  if (Number.isFinite(model.avgLatency) && model.avgLatency > 0) score -= model.avgLatency / 100
  score += model.contextLimit / 10_000
  return score
}

export function selectModel(messages: Message[], hasImages = false, hasDocuments = false, estimatedTokenCount = 0): AIModel | null {
  const requirements = analyzeRequest(messages, hasImages, hasDocuments, estimatedTokenCount)
  const models = Array.from(getHealthCache().values())
  return models.sort((a, b) => scoreModel(b, requirements) - scoreModel(a, requirements))[0] || null
}

export function getFailoverModels(primaryModel: AIModel): AIModel[] {
  return Array.from(getHealthCache().values())
    .filter(model => model.id !== primaryModel.id && model.isHealthy)
    .sort((a, b) => {
      const providerPenaltyA = a.provider === primaryModel.provider ? 100 : 0
      const providerPenaltyB = b.provider === primaryModel.provider ? 100 : 0
      const baseline = { chat: true, vision: false, reasoning: true, coding: true, documents: false, needsLargeContext: false }
      return (scoreModel(b, baseline) - providerPenaltyB) - (scoreModel(a, baseline) - providerPenaltyA)
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

async function* generateGeminiResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const genModel = getGeminiClient().getGenerativeModel({
    model: model.id,
    systemInstruction: systemPrompt,
    generationConfig: model.id.startsWith('gemini-3.') ? { maxOutputTokens: 8192 } : { temperature, maxOutputTokens: 8192 },
  })
  const history = messages.slice(0, -1).map(message => ({
    role: message.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: message.content || '' }],
  }))
  const lastMessage = messages[messages.length - 1]
  const result = await genModel.startChat({ history }).sendMessageStream(lastMessage?.content || '')
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

async function* generateGroqResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const stream = await getGroqClient().chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(message => ({ role: message.role as 'user' | 'assistant' | 'system', content: message.content || '' })),
    ],
    temperature,
    max_tokens: 4096,
    stream: true,
  })
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield content
  }
}

async function* generateOpenRouterResponse(model: AIModel, messages: Message[], systemPrompt: string, temperature: number): AsyncGenerator<string, void, unknown> {
  const stream = await getOpenRouterClient().chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(message => ({ role: message.role as 'user' | 'assistant' | 'system', content: message.content || '' })),
    ],
    temperature,
    max_tokens: 4096,
    stream: true,
  })
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield content
  }
}

export async function performWebSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const { search } = await import('duck-duck-scrape')
    const result = await search(query, { safeSearch: 0 })
    return (result.results || []).slice(0, 4).map(item => ({ title: item.title, url: item.url, snippet: item.description }))
  } catch (error) {
    console.error('[CarbonAI] Web search failed:', error)
    return []
  }
}

export function buildSystemPrompt(personality: 'humanoid' | 'professional', memories: Array<{ key: string; value: string }>, hasSearchResults = false): string {
  const base = personality === 'humanoid'
    ? 'You are CarbonAI-Private, a helpful AI assistant. Be friendly, natural, concise, supportive, and human-like. Do not reveal which underlying model or provider you use. If asked, say: "I\'m CarbonAI-Private. I automatically choose the most suitable AI system for each request."'
    : 'You are CarbonAI-Private, a professional AI assistant. Be precise, direct, well-structured, and concise. Do not reveal which underlying model or provider you use. If asked, say: "I\'m CarbonAI-Private. I automatically choose the most suitable AI system for each request."'
  const memoryText = memories.length ? `\n\nRelevant information about the user:\n${memories.map(memory => `- ${memory.key}: ${memory.value}`).join('\n')}` : ''
  const searchText = hasSearchResults ? '\n\nUse the supplied web-search results for current claims and cite them when appropriate.' : ''
  return `${base}${memoryText}${searchText}`
}
