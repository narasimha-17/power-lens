import { Check, Copy, Link2, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createShareLink, extractErrorMessage, revokeShareLink } from '../../api/client'

/** A "Share" button that generates (or reuses) a public, read-only link for this dashboard —
 * anyone with the link can view a live snapshot of its charts at /share/:token without
 * needing an account or access to the underlying data source, via the public
 * GET /shared/{token} endpoint. */
export function ShareDashboardButton({ dashboardId }: { dashboardId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const shareUrl = token ? `${window.location.origin}/share/${token}` : null

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleOpen() {
    setOpen(true)
    if (token) return
    setLoading(true)
    setError(null)
    try {
      const link = await createShareLink(dashboardId)
      setToken(link.token)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleRevoke() {
    setRevoking(true)
    try {
      await revokeShareLink(dashboardId)
      setToken(null)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
      >
        <Link2 className="h-3.5 w-3.5" />
        Share
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-navy-700 dark:bg-navy-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Share this dashboard</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Anyone with this link can view a read-only snapshot of this dashboard's charts — no
            login required, and they won't see your other sources or dashboards.
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating link…
            </div>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}

          {shareUrl && !loading && (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
                />
                <button
                  onClick={handleCopy}
                  title="Copy link"
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="mt-3 text-xs font-medium text-rose-500 hover:text-rose-600 disabled:opacity-50"
              >
                {revoking ? 'Revoking…' : 'Revoke this link'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
