'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function ChatInterface({ chatId, onCreateChat, onOpenSidebar, user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPersonalityModal, setShowPersonalityModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()

  useEffect(() => { if (!chatId) { setMessages([]); return } loadMessages() }, [chatId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px' }
  }, [input])
  useEffect(() => { if (user && !user.personality) setShowPersonalityModal(true) }, [user])

  const loadMessages = async () => {
    if (!chatId) return
    setLoading(true)
    const res = await fetch(`/api/chat/messages?chatId=${chatId}`, { credentials: 'include' })
    if (res.ok) { const data = await res.json(); setMessages(data.messages || []) }
    setLoading(false)
  }

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isGenerating || !chatId) return

    let uploadedAttachments: Attachment[] = []
    if (attachments.length > 0) {
      for (const file of attachments) {
        if (file.size > 50 * 1024 * 1024) continue
        const formData = new FormData()
        formData.append('file', file)
        formData.append('chatId', chatId)
        const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData })
        if (res.ok) uploadedAttachments.push(await res.json())
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(), chat_id: chatId, user_id: user.id, role: 'user',
      content: input.trim(), attachments: uploadedAttachments,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }

    await fetch('/api/chat/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(userMessage),
    })

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachments([])
    setIsGenerating(true)
    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          chatId, hasImages: uploadedAttachments.some(a => a.file_type.startsWith('image/')),
          hasDocuments: uploadedAttachments.some(a => ['application/pdf', 'text/plain', 'text/csv'].includes(a.file_type)),
        }), signal: abortRef.current.signal,
      })

      if (!response.ok) throw new Error('Failed')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream')

      let assistantContent = ''
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.chunk) {
                assistantContent += data.chunk
                setMessages(prev => {
                  const last = prev[prev.length - 1]
                  if (last?.role === 'assistant') return [...prev.slice(0, -1), { ...last, content: assistantContent }]
                  return prev
                })
              }
            } catch {}
          }
        }
      }
      await loadMessages()
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), chat_id: chatId, user_id: user.id, role: 'assistant',
          content: "I'm having trouble responding right now. Please try again in a moment.",
          attachments: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
    } finally { setIsGenerating(false); abortRef.current = null }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
  const handleStop = () => { abortRef.current?.abort(); setIsGenerating(false) }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const valid = files.filter(f => f.size <= 50 * 1024 * 1024)
    if (valid.length < files.length) alert('Some files exceed 50MB and were skipped')
    setAttachments(prev => [...prev, ...valid]); e.target.value = ''
  }
  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index))
  const copyMessage = (content: string) => navigator.clipboard.writeText(content)

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return }
      const u = new SpeechSynthesisUtterance(text)
      u.onend = () => setIsSpeaking(false)
      window.speechSynthesis.speak(u); setIsSpeaking(true)
    }
  }

  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported'); return }
    const recognition = new SR()
    recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (e: any) => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t) }
    recognition.onend = () => setIsRecording(false)
    recognition.start(); setIsRecording(true)
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
    <div className="flex-1 flex flex-col h-screen">
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-carbon-200 dark:border-carbon-800 bg-white dark:bg-carbon-950">
        <button onClick={onOpenSidebar} className="p-2 rounded-lg hover:bg-carbon-100 dark:hover:bg-carbon-800"><Menu className="h-5 w-5" /></button>
        <span className="font-semibold">CarbonAI</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !loading && <div className="text-center py-12"><p className="text-carbon-400">How can I help you today?</p></div>}
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 mt-1"><span className="text-white font-bold text-xs">C</span></div>
            )}
            <div className={`max-w-[85%] md:max-w-[75%] space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              {message.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-carbon-100 dark:bg-carbon-800 text-sm">
                      {att.file_type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="truncate max-w-[150px]">{att.filename}</span>
                      <span className="text-carbon-400 text-xs">{formatFileSize(att.file_size)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={`relative group px-4 py-3 rounded-2xl ${message.role === 'user' ? 'bg-accent text-white' : 'bg-carbon-100 dark:bg-carbon-800 text-carbon-900 dark:text-carbon-100'}`}>
                <div className="prose dark:prose-invert max-w-none text-sm">
                  {message.role === 'assistant' ? <MarkdownContent content={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                </div>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-carbon-200 dark:border-carbon-700">
                    <p className="text-xs text-carbon-500 mb-2">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline truncate max-w-[200px]">[{i + 1}] {s.title}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {message.role === 'assistant' && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => copyMessage(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Copy"><Copy className="h-3.5 w-3.5 text-carbon-400" /></button>
                  <button onClick={() => speakText(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Read aloud">
                    {isSpeaking ? <VolumeX className="h-3.5 w-3.5 text-carbon-400" /> : <Volume2 className="h-3.5 w-3.5 text-carbon-400" />}
                  </button>
                  <button onClick={() => copyMessage(message.content)} className="p-1.5 rounded hover:bg-carbon-100 dark:hover:bg-carbon-800" title="Share"><Share2 className="h-3.5 w-3.5 text-carbon-400" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isGenerating && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">C</span></div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-carbon-100 dark:bg-carbon-800">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-carbon-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-carbon-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-carbon-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-carbon-200 dark:border-carbon-800 bg-white dark:bg-carbon-950 px-4 py-4">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-carbon-100 dark:bg-carbon-800 text-sm">
                {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <span className="text-carbon-400 text-xs">{formatFileSize(file.size)}</span>
                <button onClick={() => removeAttachment(index)} className="p-0.5 rounded hover:bg-carbon-200"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.md" />
          <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-xl hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-500 transition-colors" title="Attach files">
            <Paperclip className="h-5 w-5" />
          </button>
          <div className="flex-1 relative">
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Message CarbonAI..." rows={1} disabled={isGenerating}
              className="w-full px-4 py-3 rounded-xl bg-carbon-50 dark:bg-carbon-900 border border-carbon-200 dark:border-carbon-700 text-carbon-900 dark:text-white placeholder:text-carbon-400 focus:outline-none focus:ring-2 focus:ring-accent resize-none max-h-[200px]" />
          </div>
          <button onClick={isRecording ? () => setIsRecording(false) : startRecording}
            className={`p-3 rounded-xl transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-500'}`}>
            <Mic className="h-5 w-5" />
          </button>
          {isGenerating ? (
            <button onClick={handleStop} className="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"><Square className="h-5 w-5" /></button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0}
              className="p-3 rounded-xl bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
        <p className="text-center text-xs text-carbon-400 mt-2">CarbonAI can make mistakes. Consider checking important information.</p>
      </div>
      {showPersonalityModal && <PersonalityModal onComplete={() => setShowPersonalityModal(false)} />}
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const [html, setHtml] = useState('')
  useEffect(() => { import('marked').then(({ marked }) => marked.parse(content, { async: true }).then(setHtml)) }, [content])
  return <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
}