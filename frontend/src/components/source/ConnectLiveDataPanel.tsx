import { Radio } from 'lucide-react'

export function ConnectLiveDataPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 px-6 py-10 text-center dark:border-navy-700">
      <Radio className="h-8 w-8 text-slate-300 dark:text-navy-600" />
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Live/streaming source connections (polling a REST endpoint on an interval) are planned
        for a later phase and aren't wired up yet.
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2 opacity-50">
        <input
          disabled
          placeholder="https://api.example.com/live-feed"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700"
        />
        <input
          disabled
          placeholder="Poll interval (seconds)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700"
        />
        <button disabled className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-400 dark:bg-navy-700">
          Connect (coming soon)
        </button>
      </div>
    </div>
  )
}
