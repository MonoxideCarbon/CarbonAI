'use client'

import LoadingMark from '@/components/ui/LoadingMark'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="fixed inset-0 grid place-items-center bg-white px-4 dark:bg-carbon-950">
          <div className="flex flex-col items-center text-center">
            <LoadingMark size={50} />
            <p className="mt-5 text-sm text-carbon-600 dark:text-carbon-300">Something went wrong.</p>
            <button onClick={() => reset()} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">Reload</button>
          </div>
        </main>
      </body>
    </html>
  )
}
