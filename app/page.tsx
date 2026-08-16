'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Lock, User, Key, ArrowRight, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'reset-confirm'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const { refresh } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('reset')
    const verified = params.get('verified')

    if (token) {
      setResetToken(token)
      setMode('reset-confirm')
      setMessage('Enter a new password to finish resetting your account.')
    } else if (verified === '1') {
      setMessage('Your email has been verified.')
    }
  }, [])

  const responseError = async (res: Response) => {
    const data = await res.json().catch(() => null)
    return typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
  }

  const goToChatAfterAuth = async () => {
    const sessionUser = await refresh()
    if (!sessionUser) {
      throw new Error('Login succeeded, but the session could not be verified. Please try again.')
    }
    router.replace('/chat')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, full_name: fullName, access_key: accessKey }),
        })
        if (!res.ok) throw new Error(await responseError(res))
        await goToChatAfterAuth()
      } else if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok) throw new Error(await responseError(res))
        await goToChatAfterAuth()
      } else if (mode === 'reset') {
        const res = await fetch('/api/auth/reset-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) throw new Error(await responseError(res))
        setMessage('If the email exists, a reset link has been sent.')
      } else if (mode === 'reset-confirm') {
        if (!resetToken) throw new Error('Reset token is missing or invalid.')
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        const res = await fetch('/api/auth/reset-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, password }),
        })
        if (!res.ok) throw new Error(await responseError(res))
        setMessage('Password updated! You can now log in.')
        setPassword('')
        setConfirmPassword('')
        setResetToken('')
        setMode('login')
        window.history.replaceState({}, '', '/')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-carbon-50 dark:bg-carbon-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent text-white mb-4">
            <span className="text-xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-carbon-900 dark:text-white">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'New password'}
          </h1>
          <p className="text-carbon-500 dark:text-carbon-400">
            {mode === 'login' ? 'Sign in to CarbonAI-Private' : mode === 'signup' ? 'Start your private AI journey' : mode === 'reset' ? 'Enter your email to reset' : 'Enter your new password'}
          </p>
        </div>

        {message && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-carbon-400" />
                <input type="text" placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carbon-200 dark:border-carbon-700 bg-white dark:bg-carbon-900 text-carbon-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-5 w-5 text-carbon-400" />
                <input type="password" placeholder="Access Key / Secret Password" value={accessKey} onChange={e => setAccessKey(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carbon-200 dark:border-carbon-700 bg-white dark:bg-carbon-900 text-carbon-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-carbon-400" />
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carbon-200 dark:border-carbon-700 bg-white dark:bg-carbon-900 text-carbon-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" required />
          </div>

          {mode !== 'reset' && (
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-carbon-400" />
              <input type="password" placeholder={mode === 'reset-confirm' ? 'New password' : 'Password'} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carbon-200 dark:border-carbon-700 bg-white dark:bg-carbon-900 text-carbon-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" required minLength={6} />
            </div>
          )}

          {(mode === 'signup' || mode === 'reset-confirm') && (
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-carbon-400" />
              <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-carbon-200 dark:border-carbon-700 bg-white dark:bg-carbon-900 text-carbon-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" required minLength={6} />
            </div>
          )}

          {mode === 'reset-confirm' && <input type="hidden" value={resetToken} readOnly />}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
              {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Update password'}
              <ArrowRight className="h-4 w-4" />
            </>}
          </button>
        </form>

        <div className="text-center space-y-2 text-sm">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => setMode('signup')} className="text-accent hover:underline">Don't have an account? Sign up</button>
              <div><button type="button" onClick={() => setMode('reset')} className="text-carbon-500 dark:text-carbon-400 hover:text-carbon-700">Forgot password?</button></div>
            </>
          )}
          {mode === 'signup' && <button type="button" onClick={() => setMode('login')} className="text-accent hover:underline">Already have an account? Sign in</button>}
          {(mode === 'reset' || mode === 'reset-confirm') && <button type="button" onClick={() => setMode('login')} className="text-accent hover:underline">Back to sign in</button>}
        </div>
      </div>
    </div>
  )
}
