import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { checkHealth } from '../api/client'
import { AppLayout } from '../components/layout/AppLayout'
import { useAppState } from '../state/AppState'

export function SettingsPage() {
  const { theme, toggleTheme } = useAppState()
  const [health, setHealth] = useState<{ status: string; ollama_reachable: boolean } | null>(null)

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Settings</h1>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Backend Status
          </h2>
          <div className="flex items-center gap-2 text-sm">
            {health ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                API reachable
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-500" />
                API unreachable — is the backend running on port 8000?
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            {health?.ollama_reachable ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Ollama reachable at localhost:11434
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-500" />
                Ollama not reachable — questions can't be answered until it's running.
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Appearance
          </h2>
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>Theme</span>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm capitalize dark:border-navy-700"
            >
              {theme}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
