'use client'

import { useCallback, useEffect, useRef, useState, createContext, useContext, ReactNode } from 'react'

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
  error: string | null
  refresh: () => Promise<AuthUser | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  refresh: async () => null,
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const userRef = useRef<AuthUser | null>(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => null)

      if (res.ok && data?.user) {
        const nextUser: AuthUser = {
          id: String(data.user.id),
          email: String(data.user.email),
          full_name: data.user.full_name ?? null,
          personality: data.user.personality || 'humanoid',
          theme: data.user.theme || 'system',
          memory_enabled: Boolean(data.user.memory_enabled),
        }
        setUser(nextUser)
        setError(null)
        return nextUser
      }

      if (res.status === 401) {
        setUser(null)
        setError(null)
        return null
      }

      const message = typeof data?.error === 'string' ? data.error : 'Unable to verify your session.'
      setError(message)
      return userRef.current
    } catch (err) {
      console.error('[auth/session]', err)
      setError('Unable to reach the authentication service.')
      return userRef.current
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
    } catch (err) {
      console.error('[auth/logout]', err)
    } finally {
      setUser(null)
      setError(null)
      window.location.assign('/')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
