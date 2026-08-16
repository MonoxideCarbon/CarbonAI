import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getChat, getUserById, listMemories, listMessages, saveMessage, updateChat, updateMessage } from '@/lib/db'
import { selectModel, generateResponse, getFailoverModels, performWebSearch, buildSystemPrompt, estimateTokens, markModelUnhealthy } from '@/lib/ai/router'
import { Message } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const { messages, chatId, hasImages, hasDocuments, enableSearch } = body
    if (!Array.isArray(messages) || messages.length === 0 || typeof chatId !== 'string') {
      return NextResponse.json({ error: 'Messages and chatId required' }, { status: 400 })
    }

    const chat = await getChat(user.id, chatId)
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const userRecord = await getUserById(user.id)
    const memories = userRecord?.memory_enabled ? await listMemories(user.id) : []
    const recentMessages = messages.slice(-50)
    const lastMessage = recentMessages[recentMessages.length - 1]
    const needsSearch = Boolean(enableSearch) || shouldSearch(lastMessage?.content || '')
    const searchResults = needsSearch ? await performWebSearch(lastMessage?.content || '') : []

    const systemPrompt = buildSystemPrompt(userRecord?.personality || 'humanoid', memories.slice(0, 10).map(m => ({ key: m.key, value: m.value })), searchResults.length > 0)
    let enhancedMessages = [...recentMessages]
    if (searchResults.length) {
      const context = searchResults.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet} (${r.url})`).join('\n')
      enhancedMessages[enhancedMessages.length - 1] = { ...lastMessage, content: `Search results:\n${context}\n\nUser query: ${lastMessage.content}` }
    }

    const estimatedTokens = estimateTokens(enhancedMessages.map((m: any) => m.content || '').join(' '))
    const selectedModel = selectModel(enhancedMessages as Message[], Boolean(hasImages), Boolean(hasDocuments), estimatedTokens)
    if (!selectedModel) return NextResponse.json({ error: 'No AI model is currently available.' }, { status: 503 })

    const assistantId = crypto.randomUUID()
    const stamp = new Date().toISOString()
    const assistant: Message = {
      id: assistantId,
      chat_id: chatId,
      user_id: user.id,
      role: 'assistant',
      content: '',
      attachments: [],
      model_used: selectedModel.id,
      sources: searchResults,
      created_at: stamp,
      updated_at: stamp,
    }
    await saveMessage(assistant)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''
        let success = false
        try {
          const tryModel = async (model: typeof selectedModel) => {
            try {
              for await (const chunk of generateResponse(model, enhancedMessages as Message[], systemPrompt, 0.7)) {
                fullResponse += chunk
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk, done: false })}\n\n`))
              }
              return true
            } catch (error) {
              console.error(`[CarbonAI] Model ${model.id} failed:`, error)
              markModelUnhealthy(model.id, error instanceof Error ? error.message : 'unknown')
              return false
            }
          }

          success = await tryModel(selectedModel)
          if (!success) {
            for (const model of getFailoverModels(selectedModel)) {
              if (await tryModel(model)) { success = true; break }
            }
          }

          if (success) {
            await updateMessage(user.id, chatId, assistantId, { content: fullResponse })
            const currentMessages = await listMessages(user.id, chatId)
            if (currentMessages.length <= 2) {
              const title = String(lastMessage?.content || 'New Chat').slice(0, 50)
              await updateChat(user.id, chatId, { title: title + (String(lastMessage?.content || '').length > 50 ? '...' : '') })
            } else {
              await updateChat(user.id, chatId, {})
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantId })}\n\n`))
          } else {
            await updateMessage(user.id, chatId, assistantId, { content: 'I\'m having trouble responding right now. Please try again in a moment.' })
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "I'm having trouble responding right now. Please try again in a moment.", done: true })}\n\n`))
          }
        } catch (error) {
          console.error('[CarbonAI/chat]', error)
          try { await updateMessage(user.id, chatId, assistantId, { content: 'The response failed. Please try again.' }) } catch {}
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'The response failed. Please try again.', done: true })}\n\n`))
        } finally {
          controller.close()
        }
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

function shouldSearch(content: string): boolean {
  const triggers = ['latest', 'news', 'current', 'today', 'recently', 'update', 'weather', 'price', 'stock', 'who won', 'election', 'happened', 'breaking', 'trending']
  const lower = content.toLowerCase()
  return triggers.some(t => lower.includes(t))
}
