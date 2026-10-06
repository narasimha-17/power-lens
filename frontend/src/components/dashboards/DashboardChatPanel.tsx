import { Check, ChevronDown, Loader2, MessageSquare, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { extractErrorMessage, modifyQuery } from '../../api/client'
import { isColorInstruction, resolveColorInstruction } from '../../lib/colorInstruction'
import { useAppState } from '../../state/AppState'
import type { Dashboard } from '../../types'

interface ChatEntry {
  id: string
  chartQuestion: string
  instruction: string
  status: 'pending' | 'ok' | 'error'
  message?: string
}

export function DashboardChatPanel({
  dashboard,
  open,
  onClose,
}: {
  dashboard: Dashboard
  open: boolean
  onClose: () => void
}) {
  const { sources, updateChartInDashboard, updateChartColor } = useAppState()
  const [chartId, setChartId] = useState<string>(dashboard.charts[0]?.id ?? '')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<ChatEntry[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const selectedChart = dashboard.charts.find((c) => c.id === chartId)

  useEffect(() => {
    if (!pickerOpen) return
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  async function handleSend() {
    if (!selectedChart || !instruction.trim() || busy) return
    const entryId = crypto.randomUUID()
    const text = instruction.trim()
    setInstruction('')
    setLog((prev) => [...prev, { id: entryId, chartQuestion: selectedChart.question, instruction: text, status: 'pending' }])

    // A "change the color" instruction is pure styling, not a data/SQL question — the
    // chat-modify pipeline regenerates SQL and chart_spec, neither of which carries color,
    // so routing it through the LLM would silently no-op. Apply it directly instead.
    if (isColorInstruction(text)) {
      const newColor = resolveColorInstruction(text, selectedChart.color)
      updateChartColor(dashboard.id, selectedChart.id, newColor)
      setLog((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'ok', message: 'Updated the chart color.' } : e)),
      )
      return
    }

    // Older pinned charts (from before sourceId was tracked) or ones whose source got
    // disconnected by a backend restart won't have a valid id — fall back to matching by
    // name against what's currently connected, rather than sending a request we know will
    // fail with a confusing HTTP status.
    const sourceId = selectedChart.sourceId || sources.find((s) => s.name === selectedChart.sourceName)?.id
    if (!sourceId) {
      setLog((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? {
                ...e,
                status: 'error',
                message: `"${selectedChart.sourceName}" isn't connected right now — reconnect it, then try again.`,
              }
            : e,
        ),
      )
      return
    }

    setBusy(true)
    try {
      const newAnswer = await modifyQuery(
        sourceId,
        selectedChart.question,
        selectedChart.answer.sql,
        selectedChart.answer.objective,
        text,
      )
      updateChartInDashboard(dashboard.id, selectedChart.id, newAnswer)
      setLog((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'ok', message: `Updated: ${newAnswer.objective}` } : e)),
      )
    } catch (err) {
      setLog((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'error', message: extractErrorMessage(err) } : e)),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`fixed right-0 top-0 z-40 flex h-full w-96 flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 dark:border-navy-700 dark:bg-navy-900 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-navy-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Modify a chart</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-slate-100 p-4 dark:border-navy-700">
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Which chart?
        </label>
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={dashboard.charts.length === 0}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200"
          >
            <span className="truncate">{selectedChart?.question ?? 'No charts pinned yet'}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {pickerOpen && dashboard.charts.length > 0 && (
            <div className="scrollbar-thin absolute left-0 right-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-navy-700 dark:bg-navy-800">
              {dashboard.charts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChartId(c.id)
                    setPickerOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    c.id === chartId
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-navy-900'
                  }`}
                >
                  <span className="truncate">{c.question}</span>
                  {c.id === chartId && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
        {log.length === 0 && (
          <p className="text-sm text-slate-400">
            Pick a chart above, then tell me how to change it — e.g. "make this a pie chart",
            "only show the last 6 months", "sort by highest first".
          </p>
        )}
        {log.map((entry) => (
          <div key={entry.id} className="space-y-1.5">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-3 py-2 text-sm text-white">
              {entry.instruction}
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm dark:bg-navy-800">
              {entry.status === 'pending' && (
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating "{entry.chartQuestion}"...
                </span>
              )}
              {entry.status === 'ok' && <span className="text-emerald-600 dark:text-emerald-400">{entry.message}</span>}
              {entry.status === 'error' && <span className="text-rose-600 dark:text-rose-400">{entry.message}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 p-4 dark:border-navy-700">
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={!selectedChart || busy}
            placeholder="Describe the change..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200"
          />
          <button
            onClick={handleSend}
            disabled={!selectedChart || !instruction.trim() || busy}
            className="flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
