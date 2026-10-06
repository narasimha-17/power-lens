import type { DashboardJobStatus } from '../types'

/**
 * Poll an auto-dashboard job's status via a Web Worker instead of an in-page setTimeout
 * loop, so it keeps running even if the browser throttles or suspends the tab's main-thread
 * timers while the user is on a different tab. Returns a cancel function that terminates the
 * worker early (e.g. if the component asking for updates unmounts).
 */
export function pollAutoDashboardJob(
  jobId: string,
  onDone: (job: DashboardJobStatus) => void,
  onError: (message: string) => void,
  intervalMs = 3000,
): () => void {
  const worker = new Worker(new URL('../workers/jobPoller.worker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (e: MessageEvent<{ type: 'done'; job: DashboardJobStatus } | { type: 'error'; message: string }>) => {
    if (e.data.type === 'done') {
      onDone(e.data.job)
    } else {
      onError(e.data.message)
    }
    worker.terminate()
  }
  worker.onerror = (e: ErrorEvent) => {
    onError(e.message || 'Background job polling failed unexpectedly.')
    worker.terminate()
  }

  worker.postMessage({ type: 'start', jobId, intervalMs })
  return () => worker.terminate()
}
