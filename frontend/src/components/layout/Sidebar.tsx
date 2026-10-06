import {
  BarChart3,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  MessageCircleQuestion,
  Plus,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const COLLAPSED_KEY = 'datapilot.sidebarCollapsed'

/** The PowerLens brand mark: a magnifying glass ("Lens") focused on a rising data trend
 * ("Power") — kept as a hand-drawn icon rather than a lucide import since no single stock
 * icon combines both halves of the name. Mirrors public/favicon.svg's shape at 24x24. */
function GraphLensIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="7" />
      <polyline points="6.5 12.5 9 9 11.5 10.5 14 6.5" />
      <line x1="15" y1="15" x2="21" y2="21" />
    </svg>
  )
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  accent?: boolean
}

const workspaceItems: NavItem[] = [
  { to: '/dashboards?new=1', label: 'New Dashboard', icon: Plus, accent: true },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/dashboards', label: 'All Dashboards', icon: BarChart3 },
  { to: '/sources', label: 'Data Sources', icon: Database },
]

const analyticsItems: NavItem[] = [
  { to: '/forecasts', label: 'Forecasts', icon: TrendingUp },
  { to: '/ask', label: 'Ask your Data', icon: MessageCircleQuestion },
  { to: '/bi-analyst', label: 'AI Business Analyst', icon: BrainCircuit },
]

function NavSection({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className="mb-4">
      {!collapsed && (
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </div>
      )}
      <div className="space-y-1">
        {items.map(({ to, label, icon: Icon, accent }, i) => (
          <NavLink
            key={`${to}-${i}`}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
                accent
                  ? 'text-brand-300 hover:bg-white/5 hover:text-brand-200'
                  : isActive
                    ? 'bg-brand-600/20 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <aside
      className={`relative flex h-screen flex-col bg-navy-900 text-slate-200 transition-all duration-200 ${
        collapsed ? 'w-[72px]' : 'w-60'
      }`}
    >
      <button
        onClick={toggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-brand-700 bg-brand-600 text-white shadow-md transition-colors hover:bg-brand-500"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
      <div className={`flex items-center gap-2 px-5 py-5 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
          <GraphLensIcon className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-base font-semibold text-white">PowerLens</div>
            <div className="text-[11px] text-slate-400">Your Intelligent Data Analyst</div>
          </div>
        )}
      </div>

      <nav className="mt-2 flex-1 overflow-y-auto px-3">
        <NavSection title="Workspace" items={workspaceItems} collapsed={collapsed} />
        <NavSection title="Analytics" items={analyticsItems} collapsed={collapsed} />
      </nav>

      <div className={`flex items-center gap-2 border-t border-white/10 px-5 py-4 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
          U
        </div>
        {!collapsed && (
          <div className="text-sm">
            <div className="font-medium text-white">Local User</div>
            <div className="text-xs text-slate-400">Workspace</div>
          </div>
        )}
      </div>
    </aside>
  )
}
