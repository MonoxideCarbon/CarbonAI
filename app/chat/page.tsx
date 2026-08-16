'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatInterface from '@/components/chat/ChatInterface'
import { Chat } from '@/types'

export default function ChatPage() {
  const { user, loading } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const router = useRouter()

  const loadChats = useCallback(async () => {
    setChatError(null)
    try {
      const res = await fetch('/api/chat/list', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        router.replace('/')
        return
      }
      if (!res.ok) throw new Error(`Chat list request failed (${res.status})`)
      const data = await res.json()
      setChats(Array.isArray(data.chats) ? data.chats : [])
    } catch (error) {
      console.error('CarbonAI: failed to load chats', error)
      setChatError('Unable to load your chats. You can retry without logging in again.')
    }
  }, [router])

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/')
      return
    }
    void loadChats()
  }, [user, loading, router, loadChats])

  const createChat = async () => {
    try {
      setChatError(null)
      const res = await fetch('/api/chat/create', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.status === 401) {
        router.replace('/')
        return
      }
      if (!res.ok) throw new Error(`Create chat failed (${res.status})`)
      const data = await res.json()
      if (!data.chat?.id) throw new Error('Invalid chat response')
      setChats(prev => [data.chat, ...prev])
      setActiveChat(data.chat.id)
      setSidebarOpen(false)
    } catch (error) {
      console.error('CarbonAI: failed to create chat', error)
      setChatError('Could not create a chat. Please try again.')
    }
  }

  const deleteChat = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chat/delete?id=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 404) throw new Error(`Delete chat failed (${res.status})`)
      setChats(prev => prev.filter(c => c.id !== chatId))
      if (activeChat === chatId) setActiveChat(null)
    } catch (error) {
      console.error('CarbonAI: failed to delete chat', error)
      setChatError('Could not delete that chat.')
    }
  }

  const renameChat = async (chatId: string, title: string) => {
    try {
      const res = await fetch('/api/chat/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatId, title }),
      })
      if (!res.ok) throw new Error(`Rename chat failed (${res.status})`)
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
    } catch (error) {
      console.error('CarbonAI: failed to rename chat', error)
      setChatError('Could not rename that chat.')
    }
  }

  const pinChat = async (chatId: string, pinned: boolean) => {
    try {
      const res = await fetch('/api/chat/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatId, pinned }),
      })
      if (!res.ok) throw new Error(`Pin chat failed (${res.status})`)
      setChats(prev => prev
        .map(c => c.id === chatId ? { ...c, pinned } : c)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))))
    } catch (error) {
      console.error('CarbonAI: failed to pin chat', error)
      setChatError('Could not update that chat.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-carbon-950">
        <div className="animate-pulse text-carbon-500">Loading CarbonAI...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex bg-white dark:bg-carbon-950 text-carbon-900 dark:text-carbon-100">
      <div className="hidden md:block w-72 flex-shrink-0">
        <Sidebar chats={chats} activeChat={activeChat} onSelectChat={setActiveChat}
          onCreateChat={createChat} onDeleteChat={deleteChat} onRenameChat={renameChat} onPinChat={pinChat} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-carbon-900">
            <Sidebar chats={chats} activeChat={activeChat} onSelectChat={(id) => { setActiveChat(id); setSidebarOpen(false) }}
              onCreateChat={createChat} onDeleteChat={deleteChat} onRenameChat={renameChat} onPinChat={pinChat} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {chatError && (
          <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <span className="flex-1">{chatError}</span>
            <button onClick={() => void loadChats()} className="rounded-lg px-3 py-1.5 font-medium hover:bg-red-100 dark:hover:bg-red-900/40">Retry</button>
            <button onClick={() => setChatError(null)} className="rounded-lg px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/40" aria-label="Dismiss">×</button>
          </div>
        )}
        <ChatInterface chatId={activeChat} onCreateChat={createChat} onOpenSidebar={() => setSidebarOpen(true)} user={user} />
      </div>
    </div>
  )
}
