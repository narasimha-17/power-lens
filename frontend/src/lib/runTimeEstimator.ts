const STORAGE_KEY = 'datapilot.runDurations'
const MAX_SAMPLES_PER_SOURCE = 10

type DurationHistory = Record<string, number[]>

function load(): DurationHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(history: DurationHistory) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // ignore
  }
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Estimated run time (ms) for a source, based on its own run history — falling back to the
 * average across every source once at least one run anywhere has completed, so the very
 * first question ever asked still gets a (rough) estimate instead of none at all. */
export function getEstimatedRunMs(sourceId: string | undefined): number | null {
  if (!sourceId) return null
  const history = load()
  const own = history[sourceId]
  if (own?.length) return average(own)

  const all = Object.values(history).flat()
  return all.length ? average(all) : null
}

export function recordRunDuration(sourceId: string | undefined, durationMs: number) {
  if (!sourceId) return
  const history = load()
  const samples = [...(history[sourceId] ?? []), durationMs].slice(-MAX_SAMPLES_PER_SOURCE)
  history[sourceId] = samples
  save(history)
}
