import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { AIModel, ModelCapabilities, Message } from '@/types'

// Provider clients (initialized lazily)
let geminiClient: GoogleGenerativeAI | null = null
let groqClient: Groq | null = null
let openRouterClient: OpenAI | null = null

function getGeminiClient() {
  if (!geminiClient) geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return geminiClient
}

function getGroqClient() {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY! })
  return groqClient
}

function getOpenRouterClient() {
  if (!openRouterClient) {
    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://carbonai-private.vercel.app',
        'X-Title': 'CarbonAI-Private',
      },
    })
  }
  return openRouterClient
}

// Known free models with capabilities (updated dynamically)
const KNOWN_FREE_MODELS: AIModel[] = [
  // Gemini
  {
    id: 'gemini-1.5-flash-latest',
    provider: 'gemini',
    name: 'Gemini 1.5 Flash',
    capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true },
    contextLimit: 1000000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'gemini-1.5-pro-latest',
    provider: 'gemini',
    name: 'Gemini 1.5 Pro',
    capabilities: { chat: true, vision: true, reasoning: true, coding: true, documents: true, largeContext: true },
    contextLimit: 2000000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  // Groq
  {
    id: 'llama-3.1-70b-versatile',
    provider: 'groq',
    name: 'Llama 3.1 70B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 128000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    name: 'Llama 3.1 8B',
    capabilities: { chat: true, vision: false, reasoning: false, coding: true, documents: false, largeContext: false },
    contextLimit: 128000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'mixtral-8x7b-32768',
    provider: 'groq',
    name: 'Mixtral 8x7B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 32768,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'gemma2-9b-it',
    provider: 'groq',
    name: 'Gemma 2 9B',
    capabilities: { chat: true, vision: false, reasoning: false, coding: true, documents: false, largeContext: false },
    contextLimit: 8192,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  // OpenRouter free tier
  {
    id: 'meta-llama/llama-3.1-70b-instruct:free',
    provider: 'openrouter',
    name: 'Llama 3.1 70B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 128000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'google/gemma-2-9b-it:free',
    provider: 'openrouter',
    name: 'Gemma 2 9B',
    capabilities: { chat: true, vision: false, reasoning: false, coding: true, documents: false, largeContext: false },
    contextLimit: 8192,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b:free',
    provider: 'openrouter',
    name: 'Hermes 3 405B',
    capabilities: { chat: true, vision: false, reasoning: true, coding: true, documents: false, largeContext: true },
    contextLimit: 128000,
    isFree: true,
    isHealthy: true,
    avgLatency: 0,
  },
]

// In-memory health tracking (persists per request, refreshed periodically)
let modelHealthCache: Map<string, AIModel> = new Map()
let lastHealthRefresh = 0
const HEALTH_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function getHealthCache(): Map<string, AIModel> {
  const now = Date.now()
  if (now - lastHealthRefresh > HEALTH_REFRESH_INTERVAL || modelHealthCache.size === 0) {
    modelHealthCache = new Map(KNOWN_FREE_MODELS.map(m => [m.id, { ...m }]))
    lastHealthRefresh = now
  }
  return modelHealthCache
}

export function markModelUnhealthy(modelId: string, error?: string) {
  const cache = getHealthCache()
  const model = cache.get(modelId)
  if (model) {
    model.isHealthy = false
    model.avgLatency = Infinity
    console.warn(`[CarbonAI] Model ${modelId} marked unhealthy: ${error || 'unknown error'}`)
  }
}

export function markModelHealthy(modelId: string, latencyMs: number) {
  const cache = getHealthCache()
  const model = cache.get(modelId)
  if (model) {
    model.isHealthy = true
    model.avgLatency = latencyMs
  }
}

// Analyze request to determine required capabilities
function analyzeRequest(
  messages: Message[],
  hasImages: boolean,
  hasDocuments: boolean,
  estimatedTokens: number
): Partial<ModelCapabilities> & { needsLargeContext: boolean } {
  const lastMessage = messages[messages.length - 1]
  const content = lastMessage?.content?.toLowerCase() || ''
  const allContent = messages.map(m => m.content?.toLowerCase() || '').join(' ')

  // Detect coding requests
  const codeKeywords = ['code', 'program', 'function', 'script', 'debug', 'error', 'python', 'javascript', 'typescript', 'react', 'html', 'css', 'sql', 'api', 'json', 'xml']
  const isCoding = codeKeywords.some(kw => content.includes(kw)) || content.includes('```')

  // Detect reasoning/complex requests
  const reasoningKeywords = ['explain', 'analyze', 'compare', 'evaluate', 'reason', 'think', 'complex', 'mathematical', 'prove', 'solve', 'logic']
  const isReasoning = reasoningKeywords.some(kw => content.includes(kw)) || content.length > 500

  // Detect if large context needed
  const needsLargeContext = estimatedTokens > 32000 || messages.length > 20

  return {
    chat: true,
    vision: hasImages,
    reasoning: isReasoning,
    coding: isCoding,
    documents: hasDocuments,
    needsLargeContext,
  }
}

// Score models for a given task
function scoreModels(
  requirements: Partial<ModelCapabilities> & { needsLargeContext: boolean },
  models: AIModel[]
): AIModel[] {
  return models
    .filter(m => m.isHealthy && m.isFree)
    .map(model => {
      let score = 0

      // Capability matching
      if (requirements.vision && !model.capabilities.vision) score -= 1000
      if (requirements.documents && !model.capabilities.documents) score -= 500
      if (requirements.coding && model.capabilities.coding) score += 100
      if (requirements.reasoning && model.capabilities.reasoning) score += 100
      if (requirements.needsLargeContext && model.capabilities.largeContext) score += 150
      if (requirements.needsLargeContext && model.contextLimit < 64000) score -= 200

      // Provider preference: Gemini first for general tasks
      if (model.provider === 'gemini') {
        if (!requirements.vision || model.capabilities.vision) score += 50
      }

      // Latency penalty
      if (model.avgLatency > 0) {
        score -= model.avgLatency / 100
      }

      // Context limit bonus
      score += model.contextLimit / 10000

      return { ...model, score }
    })
    .sort((a, b) => (b as any).score - (a as any).score)
    .map(({ score, ...model }) => model as AIModel)
}

// Select the best model for a request
export function selectModel(
  messages: Message[],
  hasImages: boolean = false,
  hasDocuments: boolean = false,
  estimatedTokens: number = 0
): AIModel | null {
  const requirements = analyzeRequest(messages, hasImages, hasDocuments, estimatedTokens)
  const models = Array.from(getHealthCache().values())
  const scored = scoreModels(requirements, models)

  if (scored.length === 0) {
    // Fallback: try any healthy model
    const fallback = models.find(m => m.isHealthy)
    if (fallback) return fallback
    // Last resort: return first model and let it fail over
    return models[0] || null
  }

  return scored[0]
}

// Get all available healthy models (for failover)
export function getFailoverModels(primaryModel: AIModel): AIModel[] {
  const models = Array.from(getHealthCache().values())
  return models
    .filter(m => m.isHealthy && m.id !== primaryModel.id)
    .sort((a, b) => {
      // Prefer different provider
      if (a.provider !== primaryModel.provider && b.provider === primaryModel.provider) return -1
      if (a.provider === primaryModel.provider && b.provider !== primaryModel.provider) return 1
      return b.contextLimit - a.contextLimit
    })
}

// Generate response using selected model
export async function* generateResponse(
  model: AIModel,
  messages: Message[],
  systemPrompt: string,
  temperature: number = 0.7
): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now()

  try {
    if (model.provider === 'gemini') {
      yield* generateGeminiResponse(model, messages, systemPrompt, temperature)
    } else if (model.provider === 'groq') {
      yield* generateGroqResponse(model, messages, systemPrompt, temperature)
    } else if (model.provider === 'openrouter') {
      yield* generateOpenRouterResponse(model, messages, systemPrompt, temperature)
    }

    const latency = Date.now() - startTime
    markModelHealthy(model.id, latency)
  } catch (error) {
    markModelUnhealthy(model.id, error instanceof Error ? error.message : 'unknown')
    throw error
  }
}

async function* generateGeminiResponse(
  model: AIModel,
  messages: Message[],
  systemPrompt: string,
  temperature: number
): AsyncGenerator<string, void, unknown> {
  const genAI = getGeminiClient()
  const genModel = genAI.getGenerativeModel({
    model: model.id,
    systemInstruction: systemPrompt,
    generationConfig: { temperature, maxOutputTokens: 8192 },
  })

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))

  const chat = genModel.startChat({ history })
  const lastMessage = messages[messages.length - 1]

  const result = await chat.sendMessageStream(lastMessage.content)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

async function* generateGroqResponse(
  model: AIModel,
  messages: Message[],
  systemPrompt: string,
  temperature: number
): AsyncGenerator<string, void, unknown> {
  const groq = getGroqClient()

  const groqMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ]

  const stream = await groq.chat.completions.create({
    model: model.id,
    messages: groqMessages,
    temperature,
    max_tokens: 4096,
    stream: true,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield content
  }
}

async function* generateOpenRouterResponse(
  model: AIModel,
  messages: Message[],
  systemPrompt: string,
  temperature: number
): AsyncGenerator<string, void, unknown> {
  const client = getOpenRouterClient()

  const orMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ]

  const stream = await client.chat.completions.create({
    model: model.id,
    messages: orMessages,
    temperature,
    max_tokens: 4096,
    stream: true,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield content
  }
}

// Web search integration
export async function performWebSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const { search } = await import('duck-duck-scrape')
    const results = await search(query, {
      safeSearch: 0,
    })

    return results.results.slice(0, 4).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }))
  } catch (error) {
    console.error('[CarbonAI] Web search failed:', error)
    return []
  }
}

// Build system prompt based on personality and memories
export function buildSystemPrompt(
  personality: 'humanoid' | 'professional',
  memories: Array<{ key: string; value: string }>,
  hasSearchResults: boolean = false
): string {
  let prompt = ''

  if (personality === 'humanoid') {
    prompt = `You are CarbonAI-Private, a helpful AI assistant. You are friendly, natural, casual, supportive, and human-like. You occasionally use light humor when appropriate. You speak clearly and directly. You do not reveal which AI model or provider you are using. If asked about your model, respond: "I'm CarbonAI-Private. I automatically choose the most suitable AI system for each request."`
  } else {
    prompt = `You are CarbonAI-Private, a professional AI assistant. You are formal, direct, and concise. You provide accurate, well-structured information. You do not reveal which AI model or provider you are using. If asked about your model, respond: "I'm CarbonAI-Private. I automatically choose the most suitable AI system for each request."`
  }

  if (memories.length > 0) {
    prompt += `\n\nRelevant information about the user:`
    memories.forEach(m => {
      prompt += `\n- ${m.key}: ${m.value}`
    })
  }

  if (hasSearchResults) {
    prompt += `\n\nYou have access to web search results. Use them to provide accurate, up-to-date information. Cite sources when appropriate.`
  }

  return prompt
}

// Estimate token count (rough approximation)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
