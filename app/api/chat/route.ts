import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, getUserById, listMemories, saveMessage, updateChat, updateMessage } from '@/lib/db'
import { selectModel, generateResponse, getFailoverModels, performWebSearch, buildSystemPrompt, estimateTokens, markModelUnhealthy } from '@/lib/ai/router'
import type { Message } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60
const encoder = new TextEncoder()

function shouldSearch(content: string): boolean {
  const triggers = ['latest', 'news', 'current', 'today', 'recent', 'update', 'weather', 'price', 'stock', 'who won', 'election', 'happened', 'breaking', 'trending', 'look up', 'search']
  const lower = content.toLowerCase()
  return triggers.some(t => lower.includes(t))
}

function titleFromPrompt(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New Chat'
  const sentence = clean.split(/[.!?]\s/)[0].trim()
  const title = sentence || clean
  return title.length > 55 ? `${title.slice(0, 55).trim()}…` : title
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs))])
}

async function nextWithTimeout<T>(iterator: AsyncIterator<T>, timeoutMs: number): Promise<IteratorResult<T>> {
  return Promise.race([iterator.next(), new Promise<IteratorResult<T>>((_, reject) => setTimeout(() => reject(new Error('Model response timed out.')), timeoutMs))])
}

async function generateAiTitle(model: any, chatId: string, userId: string, prompt: string): Promise<string | null> {
  const titleMessage: Message = { id: crypto.randomUUID(), chat_id: chatId, user_id: userId, role: 'user', content: prompt.slice(0, 1000), attachments: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const system = 'Generate a short chat title from the user request. Return only 2 to 6 words, no quotes, no punctuation at the end, no explanation.'
  let title = ''
  try {
    for await (const chunk of generateResponse(model, [titleMessage], system, 0.2)) {
      title += chunk
      if (title.length >= 80) break
    }
  } catch {
    return null
  }
  title = title.replace(/["'`]/g, '').replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim()
  return title ? title.split(' ').slice(0, 8).join(' ') : null
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const { messages, chatId, hasImages, hasDocuments } = body
    if (!Array.isArray(messages) || messages.length === 0 || typeof chatId !== 'string') return NextResponse.json({ error: 'Messages and chatId required' }, { status: 400 })
    const recentMessages = messages.slice(-50) as Message[]
    const lastMessage = recentMessages[recentMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') return NextResponse.json({ error: 'The last message must be from the user.' }, { status: 400 })
    if (lastMessage.user_id !== user.id || lastMessage.chat_id !== chatId) return NextResponse.json({ error: 'Invalid message owner.' }, { status: 403 })

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        let assistantId = ''
        try {
          send({ status: 'Checking chat…' })
          const chat = await getChat(user.id, chatId)
          if (!chat) throw new Error('Chat not found.')

          send({ status: lastMessage.attachments?.length ? 'Reading attachments…' : 'Saving message…' })
          await saveMessage({ ...lastMessage, attachments: lastMessage.attachments || [], created_at: lastMessage.created_at || new Date().toISOString(), updated_at: lastMessage.updated_at || new Date().toISOString() })

          const userRecord = await getUserById(user.id)
          const memories = userRecord?.memory_enabled ? await listMemories(user.id) : []
          const needsSearch = shouldSearch(lastMessage.content || '')
          let searchResults: Array<{ title: string; url: string; snippet: string }> = []
          if (needsSearch) { send({ status: 'Searching the web…' }); searchResults = await withTimeout(performWebSearch(lastMessage.content || ''), 7000, []) }

          let enhancedMessages: Message[] = [...recentMessages]
          if (searchResults.length) {
            const context = searchResults.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet} (${r.url})`).join('\n')
            const original = lastMessage.content || ''
            enhancedMessages[enhancedMessages.length - 1] = { ...lastMessage, content: `Search results:\n${context}\n\nUser query: ${original}` }
          }

          send({ status: 'Choosing the best model…' })
          const estimatedTokens = estimateTokens(enhancedMessages.map(m => m.content || '').join(' '))
          const selectedModel = selectModel(enhancedMessages, Boolean(hasImages), Boolean(hasDocuments), estimatedTokens)
          if (!selectedModel) throw new Error('No compatible AI model is currently available.')

          const systemPrompt = buildSystemPrompt(userRecord?.personality || 'humanoid', memories.slice(0, 10).map(m => ({ key: m.key, value: m.value })), searchResults.length > 0)
          assistantId = crypto.randomUUID()
          const stamp = new Date().toISOString()
          const assistant: Message = { id: assistantId, chat_id: chatId, user_id: user.id, role: 'assistant', content: '', attachments: [], model_used: selectedModel.id, sources: searchResults, created_at: stamp, updated_at: stamp }
          await saveMessage(assistant)
          send({ status: 'Thinking…', model: selectedModel.name, sources: searchResults })

          let success = false
          let fullResponse = ''
          let respondingModel = selectedModel
          const tryModel = async (model: typeof selectedModel) => {
            let candidate = ''
            const iterator = generateResponse(model, enhancedMessages, systemPrompt, 0.7)[Symbol.asyncIterator]()
            try {
              while (true) {
                const result = await nextWithTimeout(iterator, 45000)
                if (result.done) break
                candidate += String(result.value || '')
                if (result.value) send({ status: 'Answering…', chunk: result.value, model: model.name })
              }
              return candidate
            } catch (error) {
              try { await iterator.return?.() } catch {}
              console.error(`[CarbonAI] Model ${model.id} failed:`, error)
              markModelUnhealthy(model.id, error instanceof Error ? error.message : 'unknown error')
              throw error
            }
          }

          const attempts = [selectedModel, ...getFailoverModels(selectedModel)]
          for (let index = 0; index < attempts.length && !success; index++) {
            const model = attempts[index]
            try {
              if (index > 0) send({ status: `Switching model… ${model.name}`, reset: true, model: model.name })
              const candidate = await tryModel(model)
              if (!candidate.trim()) throw new Error('The model returned an empty response.')
              fullResponse = candidate
              respondingModel = model
              success = true
              send({ status: 'Finalizing…', model: model.name })
              await updateMessage(user.id, chatId, assistantId, { content: fullResponse, model_used: model.id, sources: searchResults })
              const firstUser = recentMessages.find(message => message.role === 'user')?.content || lastMessage.content || 'New Chat'
              const fallbackTitle = titleFromPrompt(firstUser)
              await updateChat(user.id, chatId, { title: fallbackTitle })
              send({ done: true, messageId: assistantId, title: fallbackTitle, sources: searchResults })

              send({ status: 'Naming chat…' })
              const aiTitle = await generateAiTitle(respondingModel, chatId, user.id, firstUser)
              if (aiTitle) { await updateChat(user.id, chatId, { title: aiTitle }); send({ title: aiTitle, status: 'Done' }) }
              else send({ status: 'Done' })
            } catch (error) {
              if (index === attempts.length - 1) throw error
            }
          }
          if (!success) throw new Error('No model could complete the request.')
        } catch (error: any) {
          console.error('[CarbonAI/chat]', error)
          const message = error?.message || 'The response failed. Please try again.'
          if (assistantId) { try { await updateMessage(user.id, chatId, assistantId, { content: message }) } catch {} }
          send({ error: message, done: true })
        } finally { controller.close() }
      },
      cancel() {},
    })

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[CarbonAI/chat]', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}
