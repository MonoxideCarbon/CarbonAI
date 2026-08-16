import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryAll, runQuery, queryOne } from '@/lib/db'
import {
  selectModel, generateResponse, getFailoverModels, performWebSearch,
  buildSystemPrompt, estimateTokens, markModelUnhealthy
} from '@/lib/ai/router'
import { Message } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const { messages, chatId, hasImages, hasDocuments, enableSearch } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 })
    }

    // Get user personality and memories
    const userRecord = queryOne<{ personality: string; memory_enabled: number }>(
      'SELECT personality, memory_enabled FROM users WHERE id = ?',
      [user.id]
    )

    let memories: Array<{ key: string; value: string }> = []
    if (userRecord?.memory_enabled) {
      memories = queryAll<{ key: string; value: string }>(
        'SELECT key, value FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [user.id]
      )
    }

    // Web search
    let searchResults: Array<{ title: string; url: string; snippet: string }> = []
    const lastMessage = messages[messages.length - 1]
    const needsSearch = enableSearch || shouldSearch(lastMessage.content)

    if (needsSearch) {
      searchResults = await performWebSearch(lastMessage.content)
    }

    const systemPrompt = buildSystemPrompt(
      (userRecord?.personality || 'humanoid') as any,
      memories,
      searchResults.length > 0
    )

    let enhancedMessages = [...messages]
    if (searchResults.length > 0) {
      const searchContext = searchResults
        .map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet} (${r.url})`)
        .join('\n')
      enhancedMessages = [
        ...messages.slice(0, -1),
        { ...lastMessage, content: `Search results:\n${searchContext}\n\nUser query: ${lastMessage.content}` }
      ]
    }

    const totalContent = enhancedMessages.map(m => m.content).join(' ')
    const estimatedTokens = estimateTokens(totalContent)
    let selectedModel = selectModel(enhancedMessages, hasImages, hasDocuments, estimatedTokens)

    if (!selectedModel) {
      return NextResponse.json(
        { error: "I'm having trouble responding right now. Please try again in a moment." },
        { status: 503 }
      )
    }

    // Create placeholder assistant message
    const assistantId = crypto.randomUUID()
    runQuery(
      `INSERT INTO messages (id, chat_id, user_id, role, content, model_used, sources)
       VALUES (?, ?, ?, 'assistant', '', 'carbonai', ?)`,
      [assistantId, chatId, user.id, JSON.stringify(searchResults)]
    )

    const encoder = new TextEncoder()
    let fullResponse = ''
    let success = false

    const stream = new ReadableStream({
      async start(controller) {
        const tryModel = async (model: typeof selectedModel) => {
          if (!model) return false
          try {
            const generator = generateResponse(model, enhancedMessages, systemPrompt, 0.7)
            for await (const chunk of generator) {
              fullResponse += chunk
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk, done: false })}\n\n`))
            }
            success = true
            return true
          } catch (error) {
            console.error(`[CarbonAI] Model ${model.id} failed:`, error)
            markModelUnhealthy(model.id, error instanceof Error ? error.message : 'unknown')
            return false
          }
        }

        if (await tryModel(selectedModel)) {
          // primary succeeded
        } else {
          const failoverModels = getFailoverModels(selectedModel!)
          for (const fm of failoverModels) {
            if (await tryModel(fm)) break
          }
        }

        if (success) {
          runQuery('UPDATE messages SET content = ? WHERE id = ?', [fullResponse, assistantId])

          // Update chat title if first message
          const msgCount = queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM messages WHERE chat_id = ?',
            [chatId]
          )
          if (msgCount && msgCount.count <= 2) {
            const title = messages[0].content.slice(0, 50) + (messages[0].content.length > 50 ? '...' : '')
            runQuery('UPDATE chats SET title = ? WHERE id = ?', [title, chatId])
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantId })}\n\n`))
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "I'm having trouble responding right now. Please try again in a moment.", done: true })}\n\n`))
        }
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

function shouldSearch(content: string): boolean {
  const triggers = ['latest', 'news', 'current', 'today', 'recently', 'update', 'weather', 'price', 'stock', 'who won', 'election', 'happened', 'breaking', 'trending']
  return triggers.some(t => content.toLowerCase().includes(t))
}