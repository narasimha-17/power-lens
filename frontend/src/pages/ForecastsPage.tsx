import { AlertCircle, Loader2, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AppLayout } from '../components/layout/AppLayout'
import { extractErrorMessage, getForecast } from '../api/client'
import { formatValue, humanizeFieldName } from '../lib/format'
import { useChartPalette } from '../lib/palette'
import { useAppState } from '../state/AppState'
import type { ForecastResponse } from '../types'

const PERIOD_OPTIONS = [3, 6, 12]

export function ForecastsPage() {
  const { sources, activeSourceId, setActiveSourceId } = useAppState()

  const [valueField, setValueField] = useState<string>('')
  const [periods, setPeriods] = useState(3)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { categorical, ink } = useChartPalette()

  useEffect(() => {
    if (!activeSourceId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getForecast(activeSourceId, { value_field: valueField || undefined, periods })
      .then((data) => {
        if (cancelled) return
        setForecast(data)
        setValueField(data.value_field)
      })
      .catch((err) => {
        if (cancelled) return
        setForecast(null)
        setError(extractErrorMessage(err))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // valueField is intentionally excluded here — changing it triggers its own effect below
    // once the <select> fires, not on every render of this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceId, periods])

  useEffect(() => {
    if (!activeSourceId || !valueField || valueField === forecast?.value_field) return
    setLoading(true)
    setError(null)
    getForecast(activeSourceId, { value_field: valueField, periods })
      .then(setForecast)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueField])

  const chartData = forecast
    ? forecast.points.map((p, i) => {
        const prevIsHistory = i > 0 && !forecast.points[i - 1].is_forecast
        const isFirstForecastPoint = p.is_forecast && prevIsHistory
        return {
          bucket: p.bucket,
          actual: p.is_forecast ? null : p.value,
          forecast: p.is_forecast || isFirstForecastPoint ? p.value : null,
        }
      })
    : []
  // Bridge the gap between the last actual point and the first forecast point so the
  // dashed line continues visually from where the solid line ends, instead of a break.
  const lastHistoryIndex = chartData.findIndex((d) => d.forecast !== null) - 1
  if (lastHistoryIndex >= 0) {
    chartData[lastHistoryIndex] = { ...chartData[lastHistoryIndex], forecast: chartData[lastHistoryIndex].actual }
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Forecasts</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A simple linear-trend projection from your data's history — not a guarantee, just
              where the trend points if it keeps going.
            </p>
          </div>
        </div>

        {sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center dark:border-navy-700 dark:bg-navy-800">
            <TrendingUp className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-navy-600" />
            <p className="text-sm text-slate-400">Connect a data source first to forecast its trends.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-navy-700">
              <select
                value={activeSourceId ?? ''}
                onChange={(e) => setActiveSourceId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300 dark:[color-scheme:dark]"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {forecast && forecast.numeric_fields.length > 1 && (
                <select
                  value={valueField}
                  onChange={(e) => setValueField(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300 dark:[color-scheme:dark]"
                >
                  {forecast.numeric_fields.map((f) => (
                    <option key={f} value={f}>
                      {humanizeFieldName(f)}
                    </option>
                  ))}
                </select>
              )}

              <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                Forecast
                <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-navy-700">
                  {PERIOD_OPTIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriods(p)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        periods === p
                          ? 'bg-brand-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-navy-900 dark:text-slate-400 dark:hover:bg-navy-800'
                      }`}
                    >
                      {p}mo
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              {loading && (
                <div className="flex h-72 items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Computing trend…
                </div>
              )}

              {!loading && error && (
                <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
                  <AlertCircle className="h-6 w-6 text-amber-500" />
                  <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{error}</p>
                </div>
              )}

              {!loading && !error && forecast && (
                <>
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={chartData}>
                      <CartesianGrid vertical={false} stroke={ink.grid} />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: ink.muted, fontSize: 12 }}
                        axisLine={{ stroke: ink.axis }}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => formatValue(v)} />
                      <Legend iconType="circle" />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name={`${humanizeFieldName(forecast.value_field)} (actual)`}
                        stroke={categorical[0]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name={`${humanizeFieldName(forecast.value_field)} (forecast)`}
                        stroke={categorical[1]}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="mt-3 text-xs text-slate-400">
                    Method: {forecast.method} • based on {forecast.periods_history} month
                    {forecast.periods_history === 1 ? '' : 's'} of history, projecting{' '}
                    {forecast.periods_forecast} month{forecast.periods_forecast === 1 ? '' : 's'} forward.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
