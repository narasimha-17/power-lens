import { ArrowLeft, Download, LayoutGrid, MessageSquare, Plus, Star, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { DashboardChartsGrid } from '../components/dashboards/DashboardChartsGrid'
import { DashboardChatPanel } from '../components/dashboards/DashboardChatPanel'
import { NewDashboardModal } from '../components/dashboards/NewDashboardModal'
import { ShareDashboardButton } from '../components/dashboards/ShareDashboardButton'
import { humanizeFieldName } from '../lib/format'
import { useAppState } from '../state/AppState'
import type { DashboardFilter } from '../types'

export function DashboardDetailPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const navigate = useNavigate()
  const {
    dashboards,
    removeChartFromDashboard,
    deleteDashboard,
    toggleDashboardFavorite,
    updateChartLive,
    updateChartInDashboard,
  } = useAppState()
  const [addingChart, setAddingChart] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [filters, setFilters] = useState<DashboardFilter[]>([])

  const dashboard = dashboards.find((d) => d.id === dashboardId)

  if (!dashboard) {
    return <Navigate to="/dashboards" replace />
  }

  const currentDashboardId = dashboard.id

  /** Clicking a bar/slice toggles that field's filter: clicking the same value again clears
   * it, clicking a different value for the same field replaces it, and clicking a bar in a
   * different field adds another filter — so several charts can cross-filter at once, the
   * same way selecting a slice on one Power BI visual filters every other visual on the page. */
  function handlePointClick(field: string, value: unknown) {
    setFilters((prev) => {
      const existing = prev.find((f) => f.field === field)
      if (existing && String(existing.value) === String(value)) {
        return prev.filter((f) => f.field !== field)
      }
      return [...prev.filter((f) => f.field !== field), { field, value }]
    })
  }

  function handleDeleteDashboard() {
    deleteDashboard(currentDashboardId)
    navigate('/dashboards')
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-navy-800 dark:bg-navy-950">
        <div>
          <button
            onClick={() => navigate('/dashboards')}
            className="mb-2 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 print:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            All Dashboards
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">{dashboard.name}</h1>
            <button
              onClick={() => toggleDashboardFavorite(currentDashboardId)}
              title={dashboard.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-500 dark:border-navy-700 dark:hover:border-amber-900 dark:hover:bg-amber-950/30 print:hidden"
            >
              <Star
                className={`h-4 w-4 ${dashboard.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                strokeWidth={2.25}
              />
            </button>
          </div>
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
                  <X className="h-3 w-3" />
                </button>
              ))}
              {filters.length > 1 && (
                <button
                  onClick={() => setFilters([])}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <button
            onClick={() => setChatOpen((v) => !v)}
            title="Modify a chart with chat"
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              chatOpen
                ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            onClick={() => setAddingChart(true)}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Chart
          </button>
          <button
            onClick={() => window.print()}
            title="Export this dashboard as a PDF (uses your browser's print dialog — choose 'Save as PDF')"
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900 print:hidden"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <div className="print:hidden">
            <ShareDashboardButton dashboardId={dashboard.id} />
          </div>
          <button
            onClick={handleDeleteDashboard}
            title="Delete dashboard"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:border-navy-700 dark:hover:bg-rose-950/30 print:hidden"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-6 print:p-0">
        {dashboard.charts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center dark:border-navy-700 dark:bg-navy-800">
            <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-navy-600" />
            <p className="mb-4 text-sm text-slate-400">
              No charts pinned yet. Ask a question about your data and pin the result here.
            </p>
            <button
              onClick={() => setAddingChart(true)}
              className="inline-block rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300"
            >
              + Add your first chart
            </button>
          </div>
        ) : (
          <DashboardChartsGrid
            charts={dashboard.charts}
            filters={filters}
            onPointClick={handlePointClick}
            onDeleteChart={(chartId) => removeChartFromDashboard(dashboard.id, chartId)}
            onToggleChartLive={(chartId) => {
              const chart = dashboard.charts.find((c) => c.id === chartId)
              updateChartLive(dashboard.id, chartId, !chart?.live)
            }}
            onChartLiveUpdate={(chartId, answer) => updateChartInDashboard(dashboard.id, chartId, answer)}
          />
        )}
      </div>

      {addingChart && (
        <NewDashboardModal dashboardId={dashboard.id} onClose={() => setAddingChart(false)} />
      )}

      <DashboardChatPanel dashboard={dashboard} open={chatOpen} onClose={() => setChatOpen(false)} />
    </AppLayout>
  )
}
