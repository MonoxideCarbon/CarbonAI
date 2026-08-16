'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatInterface from '@/components/chat/ChatInterface'
import { Chat } from '@/types'

export default function ChatPage() {
  const { user, loading, error: authError, refresh } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const loadChats = useCallback(async (signal?: AbortSignal) => {
    try {
      setPageError(null)
      const res = await fetch('/api/chat/list', {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      const data = await res.json().catch(() => null)

      if (res.status === 401) {
        const verified = await refresh()
        if (!verified) {
          router.replace('/')
          return
        }
        return loadChats(signal)
      }

      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load your chats.')
      }

      const nextChats = Array.isArray(data?.chats) ? data.chats : []
      setChats(nextChats)
      setActiveChat((current) => current && nextChats.some((chat: Chat) => chat.id === current) ? current : null)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('[chat/list]', err)
      setPageError(err?.message || 'Unable to load your chats.')
    }
  }, [refresh, router])

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/')
      return
    }

    const controller = new AbortController()
    void loadChats(controller.signal)
    return () => controller.abort()
  }, [loading, user, router, loadChats])

  const createChat = useCallback(async () => {
    if (busy || !user) return
    setBusy(true)
    setPageError(null)
    try {
      const res = await fetch('/api/chat/create', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (res.status === 401) {
        const verified = await refresh()
        if (!verified) {
          router.replace('/')
          return
        }
        throw new Error('Your session changed. Please try again.')
      }
      if (!res.ok || !data?.chat) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to create a new chat.')
      }
      setChats((prev) => [data.chat, ...prev.filter((chat) => chat.id !== data.chat.id)])
      setActiveChat(data.chat.id)
      setSidebarOpen(false)
    } catch (err: any) {
      console.error('[chat/create]', err)
      setPageError(err?.message || 'Unable to create a new chat.')
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, router, user])

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chat/delete?id=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok && res.status !== 404) throw new Error('Unable to delete the chat.')
      setChats((prev) => prev.filter((chat) => chat.id !== chatId))
      setActiveChat((current) => current === chatId ? null : current)
    } catch (err: any) {
      console.error('[chat/delete]', err)
      setPageError(err?.message || 'Unable to delete the chat.')
    }
  }, [])

  const renameChat = useCallback(async (chatId: string, title: string) => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    try {
      const res = await fetch('/api/chat/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ chatId, title: cleanTitle }),
      })
      if (!res.ok) throw new Error('Unable to rename the chat.')
      setChats((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, title: cleanTitle } : chat))
    } catch (err: any) {
      console.error('[chat/rename]', err)
      setPageError(err?.message || 'Unable to rename the chat.')
    }
  }, [])

  const pinChat = useCallback(async (chatId: string, pinned: boolean) => {
    try {
      const res = await fetch('/api/chat/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ chatId, pinned }),
      })
      if (!res.ok) throw new Error('Unable to update the chat.')
      setChats((prev) => prev
        .map((chat) => chat.id === chatId ? { ...chat, pinned } : chat)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))))
    } catch (err: any) {
      console.error('[chat/pin]', err)
      setPageError(err?.message || 'Unable to update the chat.')
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-carbon-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-accent text-white flex items-center justify-center font-bold">C</div>
          <div className="text-carbon-500 dark:text-carbon-400">Verifying session...</div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex bg-white dark:bg-carbon-950 text-carbon-900 dark:text-carbon-100">
      <div className="hidden md:block w-72 flex-shrink-0">
        <Sidebar
          chats={chats}
          activeChat={activeChat}
          onSelectChat={setActiveChat}
          onCreateChat={createChat}
          onDeleteChat={deleteChat}
          onRenameChat={renameChat}
          onPinChat={pinChat}
        />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-carbon-900">
            <Sidebar
              chats={chats}
              activeChat={activeChat}
              onSelectChat={(id) => { setActiveChat(id); setSidebarOpen(false) }}
              onCreateChat={createChat}
              onDeleteChat={deleteChat}
              onRenameChat={renameChat}
              onPinChat={pinChat}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative">
        {authError && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {authError}
          </div>
        )}
        {pageError && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <span>{pageError}</span>
            <div className="flex gap-2">
              <button onClick={() => void loadChats()} disabled={busy} className="rounded-lg px-3 py-1.5 font-medium hover:bg-red-100 disabled:opacity-50 dark:hover:bg-red-900/30">Retry</button>
              <button onClick={() => setPageError(null)} className="rounded-lg px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/30">Dismiss</button>
            </div>
          </div>
        )}
        <ChatInterface
          chatId={activeChat}
          onCreateChat={createChat}
          onOpenSidebar={() => setSidebarOpen(true)}
          user={user}
        />
      </div>
    </div>
  )
}
