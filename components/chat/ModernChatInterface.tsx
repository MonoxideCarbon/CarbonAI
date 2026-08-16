'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Menu, Paperclip, Send, Sparkles, Square, X } from 'lucide-react'
import type { Attachment, Message } from '@/types'
import { formatFileSize } from '@/lib/utils'

interface Props {
  chatId: string | null
  onCreateChat: () => void
  onOpenSidebar: () => void
  onTitleChange?: (chatId: string, title: string) => void
  user: { id: string; email: string; full_name: string | null; personality: string; theme: string; memory_enabled: boolean }
}

const MAX_FILE_SIZE = 4 * 1024 * 1024

function now() { return new Date().toISOString() }

function makeMessage(userId: string, chatId: string, role: Message['role'], content: string, attachments: Attachment[] = []): Message {
  const stamp = now()
  return { id: crypto.randomUUID(), chat_id: chatId, user_id: userId, role, content, attachments, created_at: stamp, updated_at: stamp }
}

function activityLabel(status: string | null) {
  if (!status) return null
  return status
}

export default function ModernChatInterface({ chatId, onCreateChat, onOpenSidebar, onTitleChange, user }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const lastAssistantId = useMemo(() => [...messages].reverse().find(m => m.role === 'assistant')?.id, [messages])

  const loadMessages = useCallback(async () => {
    if (!chatId) { setMessages([]); return }
    try {
      const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(chatId)}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load this chat.')
      setMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err: any) {
      console.error('[chat/messages]', err)
      setError(err?.message || 'Unable to load this chat.')
    }
  }, [chatId])

  useEffect(() => { void loadMessages(); abortRef.current?.abort() }, [loadMessages])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, activity])
  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    inputRef.current.style.height = `${Math.min(180, inputRef.current.scrollHeight)}px`
  }, [input])

  const acceptFiles = (picked: File[]) => {
    const valid = picked.filter(file => file.size <= MAX_FILE_SIZE)
    if (valid.length !== picked.length) setError('Each attachment must be 4 MB or smaller on Vercel.')
    setFiles(prev => [...prev, ...valid])
  }

  const uploadAll = async (chat: string, selected: File[]) => {
    const results: Attachment[] = []
    for (const file of selected) {
      const form = new FormData()
      form.append('file', file)
      form.append('chatId', chat)
      const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Upload failed (${res.status})`)
      results.push(data as Attachment)
    }
    return results
  }

  const send = async () => {
    if (!chatId || loading || (!input.trim() && files.length === 0)) return
    setError(null)
    const text = input.trim()
    const selectedFiles = files
    setInput('')
    setFiles([])
    inputRef.current?.focus()

    const optimisticUser = makeMessage(user.id, chatId, 'user', text)
    const optimisticAssistant = makeMessage(user.id, chatId, 'assistant', '')
    setMessages(prev => [...prev, optimisticUser, optimisticAssistant])
    setLoading(true)
    setActivity(selectedFiles.length ? 'Reading attachments…' : 'Thinking…')

    try {
      let uploaded: Attachment[] = []
      if (selectedFiles.length) {
        uploaded = await uploadAll(chatId, selectedFiles)
        setMessages(prev => prev.map(m => m.id === optimisticUser.id ? { ...m, attachments: uploaded } : m))
      }

      const current = { ...optimisticUser, attachments: uploaded }
      const history = [...messages, current]
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          messages: history.map(m => ({ role: m.role, content: m.content, attachments: m.attachments || [] })),
          hasImages: uploaded.some(a => a.file_type?.startsWith('image/')),
          hasDocuments: uploaded.some(a => !a.file_type?.startsWith('image/')),
          enableSearch: true,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`)
      }
      if (!response.body) throw new Error('The AI stream was unavailable.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''

      const applyEvent = (payload: any) => {
        if (payload.status) setActivity(String(payload.status))
        if (payload.reset) {
          assistantText = ''
          setMessages(prev => prev.map(m => m.id === optimisticAssistant.id ? { ...m, content: '' } : m))
        }
        if (payload.title && onTitleChange) onTitleChange(chatId, String(payload.title))
        if (payload.chunk) {
          assistantText += String(payload.chunk)
          setMessages(prev => prev.map(m => m.id === optimisticAssistant.id ? { ...m, content: assistantText, model_used: payload.model || m.model_used, updated_at: now() } : m))
        }
        if (payload.sources) setMessages(prev => prev.map(m => m.id === optimisticAssistant.id ? { ...m, sources: payload.sources } : m))
        if (payload.error) throw new Error(String(payload.error))
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const event of events) {
          const line = event.split('\n').find(part => part.startsWith('data:'))
          if (!line) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          applyEvent(JSON.parse(raw))
        }
      }

      if (!assistantText) throw new Error('The AI returned an empty response.')
      setActivity(null)
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[chat/send]', err)
        setError(err?.message || 'Unable to complete the request.')
        setMessages(prev => prev.map(m => m.id === optimisticAssistant.id ? { ...m, content: `I couldn't complete that request. ${err?.message || ''}`.trim() } : m))
      }
      setActivity(null)
    } finally {
      setLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  if (!chatId) {
    return <div className="flex-1 grid place-items-center p-8 bg-gradient-to-br from-white via-slate-50 to-blue-50/60 dark:from-carbon-950 dark:via-carbon-950 dark:to-blue-950/20"><div className="text-center max-w-lg"><div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-lg shadow-blue-500/20"><Sparkles className="h-7 w-7 text-white" /></div><h1 className="text-3xl font-semibold tracking-tight">CarbonAI</h1><p className="mt-3 text-carbon-500 dark:text-carbon-400">Private, fast, multimodal AI. Your next chat is created automatically.</p><button onClick={onCreateChat} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-carbon-950 px-5 py-3 font-medium text-white shadow-lg shadow-black/10 hover:scale-[1.01] dark:bg-white dark:text-carbon-950"><Sparkles className="h-4 w-4" />Start chatting</button></div></div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_34%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_34%)]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-carbon-200/70 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-carbon-800/70 dark:bg-carbon-950/75 md:px-6">
        <div className="flex items-center gap-3"><button onClick={onOpenSidebar} className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/5 md:hidden"><Menu className="h-5 w-5" /></button><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-sm"><Sparkles className="h-4 w-4 text-white" /></div><div><div className="font-semibold tracking-tight">CarbonAI</div><div className="text-[11px] text-carbon-400">Private multimodal assistant</div></div></div>
        <div className="flex items-center gap-2 text-xs text-carbon-400">{activity && <><span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /><span>{activityLabel(activity)}</span></>}</div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-5 md:px-8 lg:px-16 xl:px-28">
        <div className="mx-auto max-w-4xl space-y-5">
          {messages.map(message => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={message.role === 'user' ? 'max-w-[88%] rounded-3xl bg-carbon-950 px-4 py-3 text-white shadow-sm dark:bg-white dark:text-carbon-950' : 'w-full max-w-3xl'}>
                {message.attachments?.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{message.attachments.map(att => <div key={att.id} className="flex items-center gap-2 rounded-xl border border-carbon-200/70 bg-white/80 px-3 py-2 text-xs dark:border-carbon-700 dark:bg-carbon-900/70">{att.file_type?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}<span className="max-w-52 truncate">{att.filename}</span><span className="text-carbon-400">{formatFileSize(att.file_size)}</span></div>)}</div>}
                <div className={message.role === 'assistant' ? 'rounded-3xl px-1 py-2' : ''}>
                  {message.content ? <div className="whitespace-pre-wrap break-words text-[15px] leading-7">{message.content}</div> : message.id === lastAssistantId && loading ? <div className="flex items-center gap-2 py-3 text-carbon-400"><span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-.2s]" /><span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-.1s]" /><span className="h-2 w-2 animate-bounce rounded-full bg-current" /></div> : null}
                  {message.sources?.length ? <div className="mt-4 space-y-2 border-t border-carbon-200/60 pt-3 dark:border-carbon-800">{message.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-carbon-200/70 p-3 hover:bg-black/[0.02] dark:border-carbon-800 dark:hover:bg-white/[0.02]"><div className="text-xs font-medium">{source.title}</div><div className="mt-1 truncate text-[11px] text-carbon-400">{source.url}</div></a>)}</div> : null}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-carbon-200/70 bg-white/80 px-3 pb-4 pt-3 backdrop-blur-xl dark:border-carbon-800/70 dark:bg-carbon-950/80 md:px-8">
        <div className="mx-auto max-w-4xl">
          {error && <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">{error}<button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button></div>}
          {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-carbon-200 bg-white px-3 py-2 text-xs dark:border-carbon-800 dark:bg-carbon-900"><span className="max-w-44 truncate">{file.name}</span><span className="text-carbon-400">{formatFileSize(file.size)}</span><button onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}><X className="h-3.5 w-3.5" /></button></div>)}</div>}
          <div onDragOver={e => { e.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={e => { e.preventDefault(); setDragActive(false); acceptFiles(Array.from(e.dataTransfer.files)) }} className={`rounded-3xl border p-2 shadow-[0_12px_40px_rgba(15,23,42,0.08)] transition ${dragActive ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20' : 'border-carbon-200 bg-white dark:border-carbon-800 dark:bg-carbon-900/90'}`}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Message CarbonAI…" rows={1} className="block w-full resize-none bg-transparent px-3 py-3 text-[15px] outline-none placeholder:text-carbon-400" />
            <div className="flex items-center justify-between px-1 pb-1"><div className="flex items-center gap-1"><input ref={fileRef} type="file" multiple className="hidden" onChange={e => acceptFiles(Array.from(e.target.files || []))} /><button onClick={() => fileRef.current?.click()} title="Attach files" className="rounded-xl p-2 text-carbon-500 hover:bg-black/5 dark:hover:bg-white/5"><Paperclip className="h-5 w-5" /></button><span className="px-2 text-[11px] text-carbon-400">Images, PDFs, code & text · 4 MB each</span></div>{loading ? <button onClick={() => abortRef.current?.abort()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white"><Square className="h-4 w-4" />Stop</button> : <button onClick={() => void send()} disabled={!input.trim() && files.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-carbon-950 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white dark:text-carbon-950"><Send className="h-4 w-4" />Send</button>}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
