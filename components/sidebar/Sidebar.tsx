'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Plus, MessageSquare, Settings, LogOut, Trash2, Edit2, Pin, PinOff, Search, X, ChevronRight, User } from 'lucide-react'
import { Chat } from '@/types'

interface SidebarProps {
  chats: Chat[]
  activeChat: string | null
  onSelectChat: (id: string) => void
  onCreateChat: () => void
  onDeleteChat: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onPinChat: (id: string, pinned: boolean) => void
}

export default function Sidebar({ chats, activeChat, onSelectChat, onCreateChat, onDeleteChat, onRenameChat, onPinChat }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const router = useRouter()
  const { logout } = useAuth()

  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const startRename = (chat: Chat) => { setEditingId(chat.id); setEditTitle(chat.title) }
  const saveRename = () => { if (editingId && editTitle.trim()) { onRenameChat(editingId, editTitle.trim()); setEditingId(null) } }

  return (
    <div className="h-full flex flex-col bg-carbon-50 dark:bg-carbon-900 border-r border-carbon-200 dark:border-carbon-800">
      <div className="p-4 border-b border-carbon-200 dark:border-carbon-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="font-semibold text-carbon-900 dark:text-white">CarbonAI</span>
        </div>
        <button onClick={onCreateChat}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors">
          <Plus className="h-4 w-4" /> New Chat
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-carbon-400" />
          <input type="text" placeholder="Search chats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-white dark:bg-carbon-800 border border-carbon-200 dark:border-carbon-700 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5"><X className="h-4 w-4 text-carbon-400" /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filteredChats.map(chat => (
          <div key={chat.id} onClick={() => onSelectChat(chat.id)}
            className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              activeChat === chat.id ? 'bg-accent/10 text-accent' : 'hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-700 dark:text-carbon-300'
            }`}>
            {chat.pinned && <Pin className="h-3 w-3 flex-shrink-0" />}
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            {editingId === chat.id ? (
              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={saveRename}
                onKeyDown={e => { if (e.key === 'Enter') saveRename() }} autoFocus
                className="flex-1 bg-transparent text-sm focus:outline-none" onClick={e => e.stopPropagation()} />
            ) : (
              <span className="flex-1 text-sm truncate">{chat.title}</span>
            )}
            <div className="hidden group-hover:flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); onPinChat(chat.id, !chat.pinned) }} className="p-1 rounded hover:bg-carbon-200 dark:hover:bg-carbon-700">
                {chat.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
              <button onClick={e => { e.stopPropagation(); startRename(chat) }} className="p-1 rounded hover:bg-carbon-200 dark:hover:bg-carbon-700">
                <Edit2 className="h-3 w-3" />
              </button>
              <button onClick={e => { e.stopPropagation(); onDeleteChat(chat.id) }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        {filteredChats.length === 0 && <div className="text-center py-8 text-carbon-400 text-sm">{searchQuery ? 'No chats found' : 'No chats yet'}</div>}
      </div>

      <div className="p-3 border-t border-carbon-200 dark:border-carbon-800 space-y-1">
        <button onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-700 dark:text-carbon-300 text-sm">
          <Settings className="h-4 w-4" /> Settings
          <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${showSettings ? 'rotate-90' : ''}`} />
        </button>
        {showSettings && (
          <div className="pl-2 space-y-1 animate-fade-in">
            <button onClick={() => router.push('/settings')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-700 dark:text-carbon-300 text-sm">
              <User className="h-4 w-4" /> Account
            </button>
          </div>
        )}
        <button onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-700 dark:text-carbon-300 text-sm">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  )
}