import { Cloud, Globe } from 'lucide-react'
import { useState } from 'react'
import { connectApiDataSource, connectUrlDataSource, extractErrorMessage } from '../../api/client'
import { useAppState } from '../../state/AppState'

type Mode = 'file' | 'api'

export function ConnectCloudPanel() {
  const { refreshSources, setActiveSourceId } = useAppState()
  const [mode, setMode] = useState<Mode>('file')

  // File-URL (S3/HTTP) fields
  const [fileUrl, setFileUrl] = useState('')
  const [fileDisplayName, setFileDisplayName] = useState('')
  const [s3AccessKey, setS3AccessKey] = useState('')
  const [s3SecretKey, setS3SecretKey] = useState('')
  const [s3Region, setS3Region] = useState('')

  // REST API fields
  const [apiUrl, setApiUrl] = useState('')
  const [apiDisplayName, setApiDisplayName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [recordsPath, setRecordsPath] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isS3 = fileUrl.trim().toLowerCase().startsWith('s3://')

  async function handleConnectFile() {
    if (!fileUrl.trim()) {
      setError('A file URL is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { source_id } = await connectUrlDataSource({
        url: fileUrl.trim(),
        display_name: fileDisplayName || fileUrl.trim(),
        s3_access_key: isS3 ? s3AccessKey || null : null,
        s3_secret_key: isS3 ? s3SecretKey || null : null,
        s3_region: isS3 ? s3Region || null : null,
      })
      await refreshSources()
      setActiveSourceId(source_id)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectApi() {
    if (!apiUrl.trim()) {
      setError('An API URL is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { source_id } = await connectApiDataSource({
        url: apiUrl.trim(),
        display_name: apiDisplayName || apiUrl.trim(),
        headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
        records_path: recordsPath.trim() || null,
      })
      await refreshSources()
      setActiveSourceId(source_id)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-lg border border-slate-200 p-1 dark:border-navy-700">
        <button
          onClick={() => setMode('file')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'file'
              ? 'bg-brand-600 text-white'
              : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-navy-900'
          }`}
        >
          <Cloud className="h-3.5 w-3.5" />
          File URL
        </button>
        <button
          onClick={() => setMode('api')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'api'
              ? 'bg-brand-600 text-white'
              : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-navy-900'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          REST API
        </button>
      </div>

      {mode === 'file' ? (
        <>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Point at a CSV, Parquet, or JSON file over HTTP(S) or S3 — DuckDB streams it directly,
            nothing is downloaded ahead of time.
          </div>
          <input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://example.com/data.csv or s3://bucket/file.parquet"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <input
            value={fileDisplayName}
            onChange={(e) => setFileDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          {isS3 && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 dark:border-navy-700">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">S3 credentials</div>
              <input
                value={s3AccessKey}
                onChange={(e) => setS3AccessKey(e.target.value)}
                placeholder="Access key ID"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
              />
              <input
                type="password"
                value={s3SecretKey}
                onChange={(e) => setS3SecretKey(e.target.value)}
                placeholder="Secret access key"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
              />
              <input
                value={s3Region}
                onChange={(e) => setS3Region(e.target.value)}
                placeholder="Region (optional)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
              />
            </div>
          )}
          <button
            onClick={handleConnectFile}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </>
      ) : (
        <>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Fetch JSON from a REST API and query it like any other table. Combine with the
            auto-refresh schedule on the Data Sources page to keep it up to date.
          </div>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.example.com/orders"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <input
            value={apiDisplayName}
            onChange={(e) => setApiDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="Bearer token (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <input
            value={recordsPath}
            onChange={(e) => setRecordsPath(e.target.value)}
            placeholder='JSON key holding the record array (e.g. "data") — optional'
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <button
            onClick={handleConnectApi}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </>
      )}
      {error && <div className="text-xs text-rose-500">{error}</div>}
    </div>
  )
}
