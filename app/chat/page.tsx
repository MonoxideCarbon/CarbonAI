'use client'

import { useState, useEffect } from 'react'
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
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/')
      return
    }
    loadChats()
  }, [user, loading, router])

  const loadChats = async () => {
    const res = await fetch('/api/chat/list', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setChats(data.chats || [])
    }
  }

  const createChat = async () => {
    const res = await fetch('/api/chat/create', {
      method: 'POST',
      credentials: 'include',
    })
    if (res.ok) {
      const data = await res.json()
      setChats(prev => [data.chat, ...prev])
      setActiveChat(data.chat.id)
      setSidebarOpen(false)
    }
  }

  const deleteChat = async (chatId: string) => {
    await fetch(`/api/chat/delete?id=${chatId}`, { method: 'DELETE', credentials: 'include' })
    setChats(prev => prev.filter(c => c.id !== chatId))
    if (activeChat === chatId) setActiveChat(null)
  }

  const renameChat = async (chatId: string, title: string) => {
    await fetch('/api/chat/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatId, title }),
    })
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
  }

  const pinChat = async (chatId: string, pinned: boolean) => {
    await fetch('/api/chat/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatId, pinned }),
    })
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned } : c).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)))
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
        <ChatInterface chatId={activeChat} onCreateChat={createChat} onOpenSidebar={() => setSidebarOpen(true)} user={user} />
      </div>
    </div>
  )
}