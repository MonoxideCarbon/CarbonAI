'use client'

import { useState } from 'react'
import { User, Briefcase } from 'lucide-react'

export default function PersonalityModal({ onComplete }: { onComplete: () => void }) {
  const [selected, setSelected] = useState<'humanoid' | 'professional'>('humanoid')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch('/api/user/personality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ personality: selected }),
    })
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-carbon-900 rounded-2xl p-6 space-y-6 animate-slide-up">
        <div className="text-center">
          <h2 className="text-xl font-bold text-carbon-900 dark:text-white">How should CarbonAI behave?</h2>
          <p className="text-carbon-500 text-sm mt-1">You can change this later in Settings</p>
        </div>
        <div className="space-y-3">
          <button onClick={() => setSelected('humanoid')}
            className={`w-full p-4 rounded-xl border text-left transition-colors ${selected === 'humanoid' ? 'border-accent bg-accent/5' : 'border-carbon-200 dark:border-carbon-700 hover:bg-carbon-50 dark:hover:bg-carbon-800'}`}>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-accent" />
              <div>
                <div className="font-medium text-carbon-900 dark:text-white">Humanoid</div>
                <div className="text-xs text-carbon-500">Friendly, natural, casual, supportive, human-like</div>
              </div>
            </div>
          </button>
          <button onClick={() => setSelected('professional')}
            className={`w-full p-4 rounded-xl border text-left transition-colors ${selected === 'professional' ? 'border-accent bg-accent/5' : 'border-carbon-200 dark:border-carbon-700 hover:bg-carbon-50 dark:hover:bg-carbon-800'}`}>
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-accent" />
              <div>
                <div className="font-medium text-carbon-900 dark:text-white">Professional</div>
                <div className="text-xs text-carbon-500">Formal, direct, concise, professional</div>
              </div>
            </div>
          </button>
        </div>
        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Get Started'}
        </button>
      </div>
    </div>
  )
}