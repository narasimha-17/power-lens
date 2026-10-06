import { Check, Code2, Copy, X } from 'lucide-react'
import { useState } from 'react'

export function SqlPopover({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="View generated SQL"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500"
      >
        <Code2 className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-80 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-navy-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Generated SQL</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                title="Copy SQL"
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-600"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <pre className="scrollbar-thin max-h-64 overflow-auto px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
            {sql}
          </pre>
        </div>
      )}
    </div>
  )
}
