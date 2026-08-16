'use client'

import { useEffect } from 'react'
import LoadingMark from '@/components/ui/LoadingMark'

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('CarbonAI chat route error:', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center bg-white dark:bg-carbon-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-carbon-200 dark:border-carbon-800 bg-white dark:bg-carbon-900 p-6 text-center shadow-sm">
        <LoadingMark size={46} />
        <h1 className="mt-5 text-xl font-semibold text-carbon-900 dark:text-white">Chat could not be loaded</h1>
        <p className="mt-2 text-sm text-carbon-500 dark:text-carbon-400">An unexpected error interrupted the chat. Reloading usually restores the session.</p>
        <button type="button" onClick={() => reset()} className="mt-6 w-full rounded-xl bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-dark transition-colors">Reload chat</button>
        <button type="button" onClick={() => window.location.assign('/')} className="mt-2 w-full rounded-xl px-4 py-2.5 font-medium text-carbon-600 dark:text-carbon-300 hover:bg-carbon-100 dark:hover:bg-carbon-800 transition-colors">Return to sign in</button>
      </div>
    </main>
  )
}
