'use client'

import { useEffect } from 'react'

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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white font-bold text-xl">C</div>
        <h1 className="text-xl font-semibold text-carbon-900 dark:text-white">Chat could not be loaded</h1>
        <p className="mt-2 text-sm text-carbon-500 dark:text-carbon-400">CarbonAI encountered an unexpected error while loading the chat.</p>
        <button type="button" onClick={() => reset()} className="mt-6 w-full rounded-xl bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-dark transition-colors">Reload chat</button>
        <button type="button" onClick={() => window.location.assign('/')} className="mt-2 w-full rounded-xl px-4 py-2.5 font-medium text-carbon-600 dark:text-carbon-300 hover:bg-carbon-100 dark:hover:bg-carbon-800 transition-colors">Return to login</button>
      </div>
    </main>
  )
}
