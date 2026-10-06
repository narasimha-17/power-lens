import { AlertTriangle, BarChart3, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DashboardChartsGrid } from '../components/dashboards/DashboardChartsGrid'
import { extractErrorMessage, fetchSharedDashboard } from '../api/client'
import { humanizeFieldName } from '../lib/format'
import type { Dashboard, DashboardFilter } from '../types'

/** The public, read-only view a share link opens — deliberately outside AppLayout (no
 * sidebar/topbar, no auth) since anyone with the link, including someone without a
 * PowerLens account, should be able to view it. The backend's GET /shared/{token} returns
 * the dashboard's already-baked-in chart results, so this never touches the underlying data
 * source or needs it to still be connected. */
export function SharedDashboardPage() {
  const { token } = useParams<{ token: string }>()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<DashboardFilter[]>([])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError(null)
    fetchSharedDashboard(token)
      .then(setDashboard)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [token])

  function handlePointClick(field: string, value: unknown) {
    setFilters((prev) => {
      const existing = prev.find((f) => f.field === field)
      if (existing && String(existing.value) === String(value)) {
        return prev.filter((f) => f.field !== field)
      }
      return [...prev.filter((f) => f.field !== field), { field, value }]
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950">
      <div className="border-b border-slate-200 bg-white px-6 py-3 dark:border-navy-800 dark:bg-navy-900">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <BarChart3 className="h-4 w-4 text-brand-500" />
          PowerLens — shared dashboard (read-only)
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
          </div>
        )}

        {!loading && error && (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">This link isn't available</p>
            <p className="mt-1 text-sm text-rose-500 dark:text-rose-400">{error}</p>
          </div>
        )}

        {!loading && dashboard && (
          <>
            <div className="mb-4">
              <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">{dashboard.name}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {dashboard.charts.length} chart{dashboard.charts.length === 1 ? '' : 's'} • updated{' '}
                {new Date(dashboard.updatedAt).toLocaleString()}
              </p>
              {filters.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {filters.map((f) => (
                    <button
                      key={f.field}
                      onClick={() => setFilters((prev) => prev.filter((x) => x.field !== f.field))}
                      title="Remove this filter"
                      className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300"
                    >
                      {humanizeFieldName(f.field)} = {String(f.value)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {dashboard.charts.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">This dashboard has no charts yet.</p>
            ) : (
              <DashboardChartsGrid charts={dashboard.charts} filters={filters} onPointClick={handlePointClick} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
