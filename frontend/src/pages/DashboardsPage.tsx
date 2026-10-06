import { BarChart3, LayoutGrid, Loader2, Search, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { NewDashboardModal } from '../components/dashboards/NewDashboardModal'
import { useAppState } from '../state/AppState'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function DashboardsPage() {
  const { dashboards, deleteDashboard, buildingDashboardIds, toggleDashboardFavorite } = useAppState()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filteredDashboards = dashboards.filter((d) =>
    d.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  function handleDelete(id: string) {
    deleteDashboard(id)
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Dashboards</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Named dashboards you build by pinning charts from your questions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + New Dashboard
            </button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dashboards..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-navy-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Your Dashboards
            </h2>
          </div>

          {dashboards.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-navy-600" />
              <p className="mb-4 text-sm text-slate-400">
                No dashboards yet. Create one, then pin charts to it by asking questions about
                your data.
              </p>
              <button
                onClick={() => setCreating(true)}
                className="inline-block rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300"
              >
                + New Dashboard
              </button>
            </div>
          ) : filteredDashboards.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-navy-600" />
              <p className="text-sm text-slate-400">No dashboards match "{search}".</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-navy-700">
              {filteredDashboards.map((dashboard) => {
                const isBuilding = buildingDashboardIds.includes(dashboard.id)
                return (
                <div key={dashboard.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {dashboard.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {isBuilding
                          ? 'Generating…'
                          : `${dashboard.charts.length} chart${dashboard.charts.length === 1 ? '' : 's'} • updated ${timeAgo(dashboard.updatedAt)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isBuilding ? (
                      <button
                        onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                        title="Still generating — click to watch charts appear"
                        className="flex items-center rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-navy-900"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
                      >
                        Open
                      </button>
                    )}
                    <button
                      onClick={() => toggleDashboardFavorite(dashboard.id)}
                      title={dashboard.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-500 dark:border-navy-700 dark:hover:border-amber-900 dark:hover:bg-amber-950/30"
                    >
                      <Star
                        className={`h-4 w-4 ${dashboard.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                        strokeWidth={2.25}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(dashboard.id)}
                      title="Delete dashboard"
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>

      {creating && <NewDashboardModal onClose={() => setCreating(false)} />}
      {addingTo && <NewDashboardModal dashboardId={addingTo} onClose={() => setAddingTo(null)} />}
    </AppLayout>
  )
}
