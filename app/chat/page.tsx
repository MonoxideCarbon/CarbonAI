'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Sidebar from '@/components/sidebar/Sidebar'
import ModernChatInterface from '@/components/chat/ModernChatInterface'
import LoadingMark from '@/components/ui/LoadingMark'
import { Chat } from '@/types'

export default function ChatPage() {
  const { user, loading, error: authError, refresh } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const initializedRef = useRef(false)
  const router = useRouter()

  const createChat = useCallback(async () => {
    if (busy || !user) return null
    setBusy(true)
    setPageError(null)
    try {
      const res = await fetch('/api/chat/create', { method: 'POST', credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.status === 401) {
        const verified = await refresh()
        if (!verified) { router.replace('/'); return null }
        throw new Error('Your session changed. Please try again.')
      }
      if (!res.ok || !data?.chat) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to create a new chat.')
      setChats(prev => [data.chat, ...prev.filter(chat => chat.id !== data.chat.id)])
      setActiveChat(data.chat.id)
      setSidebarOpen(false)
      return data.chat as Chat
    } catch (err: any) {
      console.error('[chat/create]', err)
      setPageError(err?.message || 'Unable to create a new chat.')
      return null
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, router, user])

  const loadChats = useCallback(async (signal?: AbortSignal) => {
    try {
      setPageError(null)
      const res = await fetch('/api/chat/list', { credentials: 'include', cache: 'no-store', signal })
      const data = await res.json().catch(() => null)
      if (res.status === 401) {
        const verified = await refresh()
        if (!verified) { router.replace('/'); return [] }
        return loadChats(signal)
      }
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load your chats.')
      const nextChats = Array.isArray(data?.chats) ? data.chats : []
      setChats(nextChats)
      setActiveChat(current => current && nextChats.some((chat: Chat) => chat.id === current) ? current : nextChats[0]?.id || null)
      return nextChats as Chat[]
    } catch (err: any) {
      if (err?.name === 'AbortError') return []
      console.error('[chat/list]', err)
      setPageError(err?.message || 'Unable to load your chats.')
      return []
    }
  }, [refresh, router])

  useEffect(() => {
    if (loading || !user || initializedRef.current) return
    initializedRef.current = true
    const controller = new AbortController()
    void (async () => {
      const loaded = await loadChats(controller.signal)
      if (!controller.signal.aborted && loaded && loaded.length === 0) await createChat()
    })()
    return () => controller.abort()
  }, [loading, user, loadChats, createChat])

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chat/delete?id=${encodeURIComponent(chatId)}`, { method: 'DELETE', credentials: 'include', cache: 'no-store' })
      if (!res.ok && res.status !== 404) throw new Error('Unable to delete the chat.')
      setChats(prev => prev.filter(chat => chat.id !== chatId))
      setActiveChat(current => current === chatId ? null : current)
      const remaining = chats.filter(chat => chat.id !== chatId)
      if (remaining.length === 0) await createChat()
    } catch (err: any) {
      console.error('[chat/delete]', err)
      setPageError(err?.message || 'Unable to delete the chat.')
    }
  }, [chats, createChat])

  const renameChat = useCallback(async (chatId: string, title: string) => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    try {
      const res = await fetch('/api/chat/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', body: JSON.stringify({ chatId, title: cleanTitle }) })
      if (!res.ok) throw new Error('Unable to rename the chat.')
      setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title: cleanTitle } : chat))
    } catch (err: any) {
      console.error('[chat/rename]', err)
      setPageError(err?.message || 'Unable to rename the chat.')
    }
  }, [])

  const pinChat = useCallback(async (chatId: string, pinned: boolean) => {
    try {
      const res = await fetch('/api/chat/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', body: JSON.stringify({ chatId, pinned }) })
      if (!res.ok) throw new Error('Unable to update the chat.')
      setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, pinned } : chat).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updated_at.localeCompare(a.updated_at)))
    } catch (err: any) {
      console.error('[chat/pin]', err)
      setPageError(err?.message || 'Unable to update the chat.')
    }
  }, [])

  const handleTitleChange = useCallback((chatId: string, title: string) => {
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title, updated_at: new Date().toISOString() } : chat))
  }, [])

  if (loading) {
    return <div className="fixed inset-0 grid place-items-center bg-white dark:bg-carbon-950"><LoadingMark size={48} /></div>
  }

  if (!user) {
    return (
      <main className="fixed inset-0 grid place-items-center bg-white px-4 dark:bg-carbon-950">
        <div className="flex flex-col items-center gap-5 text-center">
          <LoadingMark size={48} />
          {authError && (
            <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {authError}
              <button type="button" onClick={() => void refresh()} className="ml-3 font-semibold underline underline-offset-2">Retry</button>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <div className="h-screen overflow-hidden flex bg-white text-carbon-900 dark:bg-carbon-950 dark:text-carbon-100">
      <aside className="hidden md:flex h-screen w-72 flex-shrink-0">
        <Sidebar chats={chats} activeChat={activeChat} onSelectChat={setActiveChat} onCreateChat={() => void createChat()} onDeleteChat={deleteChat} onRenameChat={renameChat} onPinChat={pinChat} />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-2xl dark:bg-carbon-900">
            <Sidebar chats={chats} activeChat={activeChat} onSelectChat={id => { setActiveChat(id); setSidebarOpen(false) }} onCreateChat={() => void createChat()} onDeleteChat={deleteChat} onRenameChat={renameChat} onPinChat={pinChat} />
          </div>
        </div>
      )}

      <main className="relative flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {authError && <div className="absolute left-4 right-4 top-3 z-40 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-800 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-amber-950/90 dark:text-amber-200">{authError}</div>}
        {pageError && (
          <div className="absolute left-4 right-4 top-3 z-40 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-700 shadow-lg backdrop-blur dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-200">
            <span className="min-w-0 truncate">{pageError}</span>
            <div className="flex shrink-0 gap-2"><button onClick={() => void loadChats()} className="rounded-xl px-3 py-1.5 font-medium hover:bg-red-100 dark:hover:bg-red-900/30">Retry</button><button onClick={() => setPageError(null)} className="rounded-xl px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/30">Dismiss</button></div>
          </div>
        )}
        <ModernChatInterface chatId={activeChat} onCreateChat={() => void createChat()} onOpenSidebar={() => setSidebarOpen(true)} onTitleChange={handleTitleChange} user={user} />
      </main>
    </div>
  )
}
