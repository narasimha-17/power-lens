/// <reference lib="webworker" />
export {}

// Runs entirely on its own thread, separate from the page. Chrome/Edge/Firefox all throttle
// (and can eventually suspend) `setTimeout` loops running on a backgrounded tab's main
// thread to save power — which used to mean an auto-dashboard build silently stalled if the
// user switched tabs while it was running. A dedicated Worker's timers aren't subject to
// that page-visibility throttling, so polling here keeps going regardless of which tab is
// focused; only actually closing the tab (which tears down its workers too) stops it.
const ctx = self as unknown as DedicatedWorkerGlobalScope

interface StartMessage {
  type: 'start'
  jobId: string
  intervalMs: number
}

function poll(jobId: string, intervalMs: number): void {
  fetch(`/api/auto-dashboard/${jobId}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
      return res.json()
    })
    .then((job) => {
      if (job.status === 'running') {
        setTimeout(() => poll(jobId, intervalMs), intervalMs)
      } else {
        ctx.postMessage({ type: 'done', job })
      }
    })
    .catch((err: unknown) => {
      ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    })
}

ctx.onmessage = (e: MessageEvent<StartMessage>) => {
  if (e.data.type === 'start') {
    poll(e.data.jobId, e.data.intervalMs)
  }
}
