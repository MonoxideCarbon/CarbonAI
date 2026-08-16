'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  ArrowLeft, Trash2, Download, Moon, Sun, Monitor, Smartphone,
  User, Brain, Volume2, Database, Shield, Info, Loader2, AlertTriangle,
  Check, X
} from 'lucide-react'

interface MemoryItem { id: string; key: string; value: string; category: string }

export default function SettingsPage() {
  const { user, loading: authLoading, logout } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('account')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [message, setMessage] = useState('')
  const [storageUsage, setStorageUsage] = useState({ chats: 0, messages: 0, media: 0 })
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push('/'); return }
    loadData()
  }, [user, authLoading, router])

  const loadData = async () => {
    const [profRes, memRes, storageRes] = await Promise.all([
      fetch('/api/auth/me', { credentials: 'include' }),
      fetch('/api/user/memories', { credentials: 'include' }),
      fetch('/api/user/storage', { credentials: 'include' }),
    ])
    if (profRes.ok) { const p = await profRes.json(); setProfile(p.user) }
    if (memRes.ok) { const m = await memRes.json(); setMemories(m.memories || []) }
    if (storageRes.ok) { const s = await storageRes.json(); setStorageUsage(s) }
    setLoading(false)
  }

  const updateProfile = async (updates: any) => {
    await fetch('/api/user/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(updates),
    })
    setProfile((prev: any) => ({ ...prev, ...updates }))
    setMessage('Saved successfully'); setTimeout(() => setMessage(''), 2000)
    if (updates.theme) applyTheme(updates.theme)
  }

  const applyTheme = (theme: string) => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'amoled')
    if (theme === 'system') root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    else root.classList.add(theme)
  }

  const updateMemory = async (id: string, value: string) => {
    await fetch('/api/user/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, value }) })
    setMemories(prev => prev.map(m => m.id === id ? { ...m, value } : m))
  }

  const updateMemoryKey = async (id: string, key: string) => {
    await fetch('/api/user/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, key }) })
    setMemories(prev => prev.map(m => m.id === id ? { ...m, key } : m))
  }

  const deleteMemory = async (id: string) => {
    await fetch(`/api/user/memory?id=${id}`, { method: 'DELETE', credentials: 'include' })
    setMemories(prev => prev.filter(m => m.id !== id))
  }

  const addMemory = async () => {
    const res = await fetch('/api/user/memory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ key: 'New Memory', value: '' }) })
    if (res.ok) { const data = await res.json(); setMemories(prev => [data.memory, ...prev]) }
  }

  const deleteAllMemories = async () => {
    await fetch('/api/user/memories', { method: 'DELETE', credentials: 'include' })
    setMemories([])
  }

  const deleteAllChats = async () => {
    await fetch('/api/user/chats', { method: 'DELETE', credentials: 'include' })
    setStorageUsage(prev => ({ ...prev, chats: 0, messages: 0 }))
    setMessage('All chats deleted'); setTimeout(() => setMessage(''), 2000)
  }

  const deleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    const res = await fetch('/api/auth/delete', { method: 'DELETE', credentials: 'include' })
    if (res.ok) logout()
  }

  const exportData = async () => {
    const res = await fetch('/api/user/export', { credentials: 'include' })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `carbonai-export-${new Date().toISOString().split('T')[0]}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-carbon-950">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  const sections = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Moon },
    { id: 'personalization', label: 'Personalisation', icon: Brain },
    { id: 'voice', label: 'Voice', icon: Volume2 },
    { id: 'storage', label: 'Storage & Data', icon: Database },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'about', label: 'About', icon: Info },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-carbon-950 text-carbon-900 dark:text-carbon-100">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => router.push('/chat')} className="flex items-center gap-2 text-carbon-500 hover:text-carbon-700 dark:hover:text-carbon-300 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </button>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm flex items-center gap-2 animate-fade-in">
            <Check className="h-4 w-4" /> {message}
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-48 space-y-1 flex-shrink-0">
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${activeSection === s.id ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-carbon-100 dark:hover:bg-carbon-800 text-carbon-600 dark:text-carbon-400'}`}>
                <s.icon className="h-4 w-4" /> {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-6 min-w-0">
            {activeSection === 'account' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50">
                  <h3 className="font-semibold mb-1">Email</h3>
                  <p className="text-sm text-carbon-600 dark:text-carbon-400">{profile?.email}</p>
                </div>
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50">
                  <h3 className="font-semibold mb-3">Password</h3>
                  <button onClick={async () => {
                    const res = await fetch('/api/auth/reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: profile?.email }) })
                    if (res.ok) setMessage('Password reset email sent')
                  }} className="px-4 py-2 rounded-lg bg-carbon-100 dark:bg-carbon-800 text-sm hover:bg-carbon-200 dark:hover:bg-carbon-700 transition-colors">Send Reset Link</button>
                </div>
                <div className="p-5 rounded-2xl border border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10">
                  <h3 className="font-semibold text-red-600 mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Danger Zone</h3>
                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/20 text-red-600 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors">
                      <Trash2 className="h-4 w-4" /> Delete Account
                    </button>
                  ) : (
                    <div className="space-y-3 animate-fade-in">
                      <p className="text-sm text-red-600">Type DELETE to confirm permanent account deletion.</p>
                      <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-carbon-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="DELETE" />
                      <div className="flex gap-2">
                        <button onClick={deleteAccount} disabled={deleteConfirmText !== 'DELETE'}
                          className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-red-700 transition-colors">Permanently Delete</button>
                        <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                          className="px-4 py-2 rounded-xl border border-carbon-300 dark:border-carbon-600 text-sm hover:bg-carbon-100 dark:hover:bg-carbon-800 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeSection === 'appearance' && (
              <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-4">
                <h3 className="font-semibold">Theme</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'amoled', label: 'AMOLED', icon: Smartphone }, { id: 'system', label: 'System', icon: Monitor }].map(t => (
                    <button key={t.id} onClick={() => updateProfile({ theme: t.id })}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${profile?.theme === t.id ? 'border-accent bg-accent/5 text-accent' : 'border-carbon-200 dark:border-carbon-700 hover:bg-carbon-100 dark:hover:bg-carbon-800'}`}>
                      <t.icon className="h-4 w-4" /><span className="text-sm font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeSection === 'personalization' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50">
                  <h3 className="font-semibold mb-4">Personality</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {[{ id: 'humanoid', label: 'Humanoid', desc: 'Friendly, casual, supportive, occasional humour' }, { id: 'professional', label: 'Professional', desc: 'Formal, direct, concise, professional' }].map(p => (
                      <button key={p.id} onClick={() => updateProfile({ personality: p.id })}
                        className={`flex-1 p-4 rounded-xl border text-left transition-colors ${profile?.personality === p.id ? 'border-accent bg-accent/5' : 'border-carbon-200 dark:border-carbon-700 hover:bg-carbon-100 dark:hover:bg-carbon-800'}`}>
                        <div className="font-medium text-carbon-900 dark:text-white">{p.label}</div>
                        <div className="text-xs text-carbon-500 mt-1">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Memory</h3>
                    <button onClick={() => updateProfile({ memory_enabled: !profile?.memory_enabled })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${profile?.memory_enabled ? 'bg-accent' : 'bg-carbon-300 dark:bg-carbon-700'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${profile?.memory_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {profile?.memory_enabled && (
                    <div className="space-y-3 animate-fade-in">
                      {memories.map(m => (
                        <div key={m.id} className="flex gap-2 items-start">
                          <input type="text" value={m.key} onChange={e => updateMemoryKey(m.id, e.target.value)}
                            className="w-1/3 px-3 py-2 rounded-lg bg-white dark:bg-carbon-800 border border-carbon-200 dark:border-carbon-700 text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Key" />
                          <input type="text" value={m.value} onChange={e => updateMemory(m.id, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-carbon-800 border border-carbon-200 dark:border-carbon-700 text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Value" />
                          <button onClick={() => deleteMemory(m.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <div className="flex gap-3 pt-2">
                        <button onClick={addMemory} className="text-sm text-accent hover:underline font-medium">+ Add memory</button>
                        {memories.length > 0 && <button onClick={deleteAllMemories} className="text-sm text-red-500 hover:underline">Delete all</button>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeSection === 'voice' && (
              <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-4">
                <h3 className="font-semibold">Speech Settings</h3>
                <p className="text-sm text-carbon-500">Speech-to-text and text-to-speech are handled by your browser's built-in Web Speech API. No audio leaves your device.</p>
              </div>
            )}
            {activeSection === 'storage' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-4">
                  <h3 className="font-semibold">Storage Usage</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-xl bg-white dark:bg-carbon-800 border border-carbon-100 dark:border-carbon-700">
                      <div className="text-2xl font-bold text-accent">{storageUsage.chats}</div><div className="text-xs text-carbon-500 mt-1">Chats</div>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-white dark:bg-carbon-800 border border-carbon-100 dark:border-carbon-700">
                      <div className="text-2xl font-bold text-accent">{storageUsage.messages}</div><div className="text-xs text-carbon-500 mt-1">Messages</div>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-white dark:bg-carbon-800 border border-carbon-100 dark:border-carbon-700">
                      <div className="text-2xl font-bold text-accent">{storageUsage.media}</div><div className="text-xs text-carbon-500 mt-1">Files</div>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-4">
                  <h3 className="font-semibold">Data Export</h3>
                  <button onClick={exportData} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-carbon-100 dark:bg-carbon-800 text-sm font-medium hover:bg-carbon-200 dark:hover:bg-carbon-700 transition-colors">
                    <Download className="h-4 w-4" /> Export All Data
                  </button>
                </div>
                <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-4">
                  <h3 className="font-semibold text-red-600">Delete Data</h3>
                  <button onClick={deleteAllChats} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                    <Trash2 className="h-4 w-4" /> Delete All Chats
                  </button>
                </div>
              </div>
            )}
            {activeSection === 'privacy' && (
              <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Privacy Policy</h3>
                  <div className="text-sm text-carbon-500 leading-relaxed space-y-3">
                    <p>CarbonAI-Private stores all data locally in SQLite and Backblaze B2 under your control. No third-party auth services are used.</p>
                    <p>AI providers receive only the messages necessary to generate responses. Media files are stored in private Backblaze B2 buckets.</p>
                    <p>When you delete a chat or account, all associated data is permanently removed.</p>
                  </div>
                </div>
                <div className="border-t border-carbon-200 dark:border-carbon-700 pt-6">
                  <h3 className="font-semibold mb-3">Terms of Service</h3>
                  <div className="text-sm text-carbon-500 leading-relaxed space-y-3">
                    <p>CarbonAI-Private uses free-tier AI models. Availability may vary.</p>
                    <p>Do not share passwords, payment details, or government IDs.</p>
                  </div>
                </div>
              </div>
            )}
            {activeSection === 'about' && (
              <div className="p-5 rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-carbon-50/50 dark:bg-carbon-900/50 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center"><span className="text-white font-bold text-2xl">C</span></div>
                  <div>
                    <h3 className="text-lg font-bold text-carbon-900 dark:text-white">CarbonAI-Private</h3>
                    <p className="text-sm text-carbon-500">Version 2.0.0</p>
                  </div>
                </div>
                <div className="text-sm text-carbon-500 leading-relaxed space-y-2">
                  <p>Built with Next.js, SQLite, Backblaze B2, and free AI providers.</p>
                  <p>Custom authentication. No Supabase. No Firebase. Fully self-contained.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}