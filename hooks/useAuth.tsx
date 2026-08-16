'use client'

import { useState, useEffect, createContext, useContext, ReactNode } from 'react'

interface AuthUser {
  id: string
  email: string
  full_name: string | null
  personality: string
  theme: string
  memory_enabled: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    window.location.href = '/'
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}