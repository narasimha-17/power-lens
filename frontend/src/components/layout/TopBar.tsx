import { Bell, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useAppState } from '../../state/AppState'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsModal } from './NotificationsModal'

export function TopBar() {
  const { theme, toggleTheme, notifications, markNotificationsRead } = useAppState()
  const [notifOpen, setNotifOpen] = useState(false)
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-navy-700 dark:bg-navy-900">
      <div />

      <div className="flex justify-center">
        <GlobalSearch />
      </div>

      <div className="flex items-center justify-end gap-4">
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <button
          onClick={() => {
            setNotifOpen(true)
            markNotificationsRead()
          }}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
          )}
        </button>

      </div>

      {notifOpen && <NotificationsModal onClose={() => setNotifOpen(false)} />}
    </header>
  )
}
