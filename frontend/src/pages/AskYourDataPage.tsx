import { Bot, Loader2, Send, Sparkles, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { AnswerResultView } from '../components/results/AnswerResultView'
import { useAppState } from '../state/AppState'

export function AskYourDataPage() {
  const { activeSourceId, sources, chatTurns, askChatQuestion, biAnalysis, runBiAnalysisFor } = useAppState()
  const activeSource = sources.find((s) => s.id === activeSourceId)
  const turns = (activeSourceId && chatTurns[activeSourceId]) || []

  const [question, setQuestion] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  // Suggested questions are generated from this specific dataset's actual schema/domain
  // (the same BI-analyst pipeline behind the "AI Business Analyst" page and the New
  // Dashboard modal) rather than a fixed, generic list that may not even apply to whatever
  // is connected — "revenue by region" means nothing for a dataset with no revenue or
  // region columns at all. Shares the same global, per-source cache as those other
  // surfaces, so it's often already warm by the time this page is opened.
  const sourceAnalysis = activeSourceId ? biAnalysis[activeSourceId] : undefined
  useEffect(() => {
    if (!activeSourceId) return
    if (biAnalysis[activeSourceId]) return
    runBiAnalysisFor(activeSourceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceId])
  const suggestedQuestions = (sourceAnalysis?.result?.recommended_questions ?? []).slice(0, 4).map((q) => q.question)

  function handleAsk(q?: string) {
    const finalQuestion = q ?? question
    if (!activeSourceId || !finalQuestion.trim()) return
    askChatQuestion(activeSourceId, activeSource?.name ?? 'Unknown source', finalQuestion)
    setQuestion('')
  }

  return (
    <AppLayout>
      <div className="flex h-full w-full flex-col p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">PowerLens Copilot</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeSource ? `Connected to "${activeSource.name}"` : 'No data source connected'}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-800">
          {turns.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <Bot className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-white">
                  {activeSource ? "What would you like to know?" : "Hi, I'm PowerLens"}
                </h2>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  {activeSource ? (
                    <>
                      Ask anything about <span className="font-medium">{activeSource.name}</span> and
                      I'll build the query, run it, and chart the result.
                    </>
                  ) : (
                    <>
                      Connect a data source first on the{' '}
                      <Link to="/sources" className="font-medium text-brand-600 hover:underline">
                        Data Sources
                      </Link>{' '}
                      page, then come back and ask me anything about it.
                    </>
                  )}
                </p>
              </div>

              {activeSourceId && sourceAnalysis?.loading && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Finding meaningful questions in this data…
                </div>
              )}

              {activeSourceId && suggestedQuestions.length > 0 && (
                <div className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleAsk(q)}
                      className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-navy-700 dark:text-slate-300 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-5">
              {turns.map((turn) => (
                <div key={turn.id} className="space-y-3">
                  <div className="flex items-start justify-end gap-2.5">
                    <div className="max-w-lg rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
                      {turn.question}
                    </div>
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-navy-700 dark:text-slate-300">
                      <User className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      {turn.pending && (
                        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-navy-900 dark:text-slate-400">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                          </span>
                          Thinking…
                        </div>
                      )}

                      {turn.error && (
                        <div className="max-w-lg rounded-2xl rounded-tl-sm bg-rose-50 px-4 py-2.5 text-sm text-rose-600 dark:bg-rose-950/30">
                          {turn.error}
                        </div>
                      )}

                      {turn.answer && (
                        <div className="max-w-full rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 p-4 dark:border-navy-700 dark:bg-navy-900">
                          <AnswerResultView answer={turn.answer} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSourceId && (
            <div className="border-t border-slate-100 p-4 dark:border-navy-700">
              {turns.length > 0 && suggestedQuestions.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleAsk(q)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-brand-300 hover:text-brand-600 dark:border-navy-700 dark:text-slate-400"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  placeholder="Ask a question about your data…"
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
                />
                <button
                  onClick={() => handleAsk()}
                  disabled={!question.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
