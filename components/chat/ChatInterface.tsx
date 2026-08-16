'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Menu, Send, Square, Paperclip, Mic, Volume2, VolumeX,
  Copy, Share2, Image as ImageIcon, FileText, X, Loader2
} from 'lucide-react'
import { Message, Attachment } from '@/types'
import { formatFileSize } from '@/lib/utils'
import PersonalityModal from './PersonalityModal'

interface ChatInterfaceProps {
  chatId: string | null
  onCreateChat: () => void
  onOpenSidebar: () => void
  user: { id: string; email: string; full_name: string | null; personality: string; theme: string; memory_enabled: boolean }
}

function now() {
  return new Date().toISOString()
}

function makeMessage(userId: string, chatId: string, role: 'user' | 'assistant', content: string, attachments: Attachment[] = []): Message {
  const timestamp = now()
  return {
    id: crypto.randomUUID(),
    chat_id: chatId,
    user_id: userId,
    role,
    content,
    attachments,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

export default function ChatInterface({ chatId, onCreateChat, onOpenSidebar, user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPersonalityModal, setShowPersonalityModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)

  const loadMessages = useCallback(async () => {
    if (!chatId) {
      setMessages([])
      setError(null)
      return
    }

    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/chat/messages?chatId=${encodeURIComponent(chatId)}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)

      if (res.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load messages.')
      }

      setMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('[chat/messages]', err)
      setError(err?.message || 'Unable to load messages.')
      setMessages([])
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null
        setLoading(false)
      }
    }
  }, [chatId])

  useEffect(() => {
    void loadMessages()
    return () => {
      loadControllerRef.current?.abort()
      abortRef.current?.abort()
    }
  }, [loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`
  }, [input])

  useEffect(() => {
    if (user && !user.personality) setShowPersonalityModal(true)
  }, [user])

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isGenerating || !chatId) return

    setError(null)
    const currentText = input.trim()
    const currentFiles = attachments
    let uploadedAttachments: Attachment[] = []

    try {
      for (const file of currentFiles) {
        if (file.size > 50 * 1024 * 1024) continue
        const formData = new FormData()
        formData.append('file', file)
        formData.append('chatId', chatId)
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        const uploadData = await uploadRes.json().catch(() => null)
        if (!uploadRes.ok) {
          throw new Error(typeof uploadData?.error === 'string' ? uploadData.error : `Upload failed (${uploadRes.status})`)
        }
        uploadedAttachments.push(uploadData as Attachment)
      }

      const userMessage = makeMessage(user.id, chatId, 'user', currentText, uploadedAttachments)

      const saveRes = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userMessage),
      })
      const saveData = await saveRes.json().catch(() => null)
      if (!saveRes.ok) {
        throw new Error(typeof saveData?.error === 'string' ? saveData.error : 'Unable to save your message.')
      }

      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const placeholder = makeMessage(user.id, chatId, 'assistant', '')
      setMessages((prev) => [...prev, userMessage, placeholder])
      setInput('')
      setAttachments([])
      setIsGenerating(true)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          messages: history,
          chatId,
          hasImages: uploadedAttachments.some((a) => a.file_type?.startsWith('image/')),
          hasDocuments: uploadedAttachments.some((a) => ['application/pdf', 'text/plain', 'text/csv'].includes(a.file_type)),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `AI request failed (${response.status})`)
      }

      if (!response.body) throw new Error('AI response stream is unavailable.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantContent = ''
      let streamError: string | null = null

      const updateAssistant = (content: string) => {
        setMessages((prev) => prev.map((message) =>
          message.id === placeholder.id ? { ...message, content, updated_at: now() } : message
        ))
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          const line = event.split('\n').find((part) => part.startsWith('data:'))
          if (!line) continue
          const payload = line.slice(5).trim()
          if (!payload) continue

          try {
            const data = JSON.parse(payload)
            if (data.chunk) {
              assistantContent += String(data.chunk)
              updateAssistant(assistantContent)
            }
            if (data.error) streamError = String(data.error)
          } catch (parseError) {
            console.warn('[chat/stream] invalid SSE payload', parseError)
          }
        }
      }

      if (streamError && !assistantContent) {
        throw new Error(streamError)
      }

      if (!assistantContent) {
        throw new Error('The AI returned an empty response.')
      }

      await loadMessages()
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[chat/send]', err)
        setError(err?.message || 'Unable to send the message.')
        setMessages((prev) => {
          const withoutEmptyAssistant = prev.filter((m, index) => !(index === prev.length - 1 && m.role === 'assistant' && !m.content))
          const hasErrorMessage = withoutEmptyAssistant.some((m) => m.role === 'assistant' && m.content.startsWith('CarbonAI:'))
          return hasErrorMessage ? withoutEmptyAssistant : [
            ...withoutEmptyAssistant,
            makeMessage(user.id, chatId, 'assistant', `CarbonAI: ${err?.message || 'I could not complete that request.'}`),
          ]
        })
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const valid = files.filter((file) => file.size <= 50 * 1024 * 1024)
    if (valid.length < files.length) setError('Files larger than 50MB were skipped.')
    setAttachments((prev) => [...prev, ...valid])
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      setError('Could not copy the message.')
    }
  }

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      setError('Text-to-speech is not supported in this browser.')
      return
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  const startRecording = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Recognition) {
      setError('Speech recognition is not supported in this browser.')
      return
    }
    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setInput(text)
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => setIsRecording(false)
    recognition.start()
    setIsRecording(true)
  }

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-2xl">C</span>
          </div>
          <h2 className="text-2xl font-bold text-carbon-900 dark:text-white">CarbonAI-Private</h2>
          <p className="text-carbon-500 dark:text-carbon-400">Your private AI assistant. Start a new chat to begin.</p>
          <button onClick={onCreateChat} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors">
            <Send className="h-4 w-4" /> Start New Chat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-screen">
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-carbon-200 dark:border-carbon-800 bg-white dark:bg-carbon-950">
        <button onClick={onOpenSidebar} className="p-2 rounded-lg hover:bg-carbon-100 dark:hover:bg-carbon-800"><Menu className="h-5 w-5" /></button>
        <span className="font-semibold">CarbonAI</span>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <span className="flex-1">{error}</span>
          <button onClick={() => void loadMessages()} className="rounded-lg px-3 py-1.5 font-medium hover:bg-red-100 dark:hover:bg-red-900/30">Retry</button>
          <button onClick={() => setError(null)} className="rounded-lg px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/30">Dismiss</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-6">
        {loading && <div className="flex items-center justify-center py-10 text-sm text-carbon-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading messages...</div>}
        {!loading && messages.length === 0 && !error && <div className="text-center py-12"><p className="text-carbon-400">How can I help you today?</p></div>}

        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'assistant' && <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 mt-1"><span className="text-white font-bold text-xs">C</span></div>}
            <div className="max-w-[85%] md:max-w-[75%] space-y-2">
              {message.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-carbon-100 dark:bg-carbon-800 text-sm">
                      {att.file_type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="truncate max-w-[150px]">{att.filename}</span>
                      <span className="text-carbon-400 text-xs">{formatFileSize(att.file_size)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={`relative group px-4 py-3 rounded-2xl ${message.role === 'user' ? 'bg-accent text-white' : 'bg-carbon-100 dark:bg-carbon-800 text-carbon-900 dark:text-carbon-100'}`}>
                <p className="whitespace-pre-wrap break-words text-sm">{message.content || (isGenerating && message.id === messages[messages.length - 1]?.id ? 'Thinking…' : '')}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-carbon-200 dark:border-carbon-700">
                    <p className="text-xs text-carbon-500 mb-2">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((source, i) => (
                        <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline truncate max-w-[200px]">[{i + 1}] {source.title}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {message.role === 'assistant' && message.content && (
                <div className="flex items-center gap-1">
                  <button onClick={() => void copyMessage(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Copy"><Copy className="h-3.5 w-3.5 text-carbon-400" /></button>
                  <button onClick={() => speakText(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Read aloud">
                    {isSpeaking ? <VolumeX className="h-3.5 w-3.5 text-carbon-400" /> : <Volume2 className="h-3.5 w-3.5 text-carbon-400" />}
                  </button>
                  <button onClick={() => void copyMessage(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Share"><Share2 className="h-3.5 w-3.5 text-carbon-400" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-carbon-200 dark:border-carbon-800 bg-white dark:bg-carbon-950 px-4 py-4">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 max-w-4xl mx-auto">
            {attachments.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-carbon-100 dark:bg-carbon-800 text-sm">
                {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <span className="text-carbon-400 text-xs">{formatFileSize(file.size)}</span>
                <button onClick={() => removeAttachment(index)} className="p-0.5 rounded hover:bg-carbon-200"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.md" />
          <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-xl hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-500 transition-colors" title="Attach files"><Paperclip className="h-5 w-5" /></button>
          <div className="flex-1">
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message CarbonAI..." rows={1} disabled={isGenerating}
              className="w-full px-4 py-3 rounded-xl bg-carbon-50 dark:bg-carbon-900 border border-carbon-200 dark:border-carbon-700 text-carbon-900 dark:text-white placeholder:text-carbon-400 focus:outline-none focus:ring-2 focus:ring-accent resize-none max-h-[200px]" />
          </div>
          <button onClick={isRecording ? () => setIsRecording(false) : startRecording} className={`p-3 rounded-xl transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-500'}`} title="Voice input"><Mic className="h-5 w-5" /></button>
          {isGenerating ? (
            <button onClick={handleStop} className="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors" title="Stop"><Square className="h-5 w-5" /></button>
          ) : (
            <button onClick={() => void handleSend()} disabled={!input.trim() && attachments.length === 0} className="p-3 rounded-xl bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Send"><Send className="h-5 w-5" /></button>
          )}
        </div>
        <p className="text-center text-xs text-carbon-400 mt-2">CarbonAI can make mistakes. Consider checking important information.</p>
      </div>

      {showPersonalityModal && <PersonalityModal onComplete={() => setShowPersonalityModal(false)} />}
    </div>
  )
}
