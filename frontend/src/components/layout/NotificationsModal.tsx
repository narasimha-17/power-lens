import { X } from 'lucide-react'
import { useAppState } from '../../state/AppState'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationsModal({ onClose }: { onClose: () => void }) {
  const { notifications } = useAppState()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-navy-800"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">Notifications</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Nothing yet — connect a data source or ask a question to see activity here.
          </p>
        ) : (
          <div className="max-h-80 space-y-3 overflow-y-auto scrollbar-thin">
            {notifications.map((n) => (
              <div key={n.id} className="border-b border-slate-100 pb-3 last:border-0 dark:border-navy-700">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{n.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{n.description}</div>
                <div className="mt-0.5 text-xs text-slate-400">{timeAgo(n.createdAt)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
