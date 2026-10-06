import { Database, History, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  connectSqlDataSource,
  deleteRecentSqlConnection,
  extractErrorMessage,
  fetchRecentSqlConnections,
  uploadSqliteFile,
} from '../../api/client'
import { useAppState } from '../../state/AppState'
import type { RecentSqlConnection, SqlConnectionRequest } from '../../types'

type Dialect = SqlConnectionRequest['dialect'] | 'sqlite'

const DEFAULT_PORT: Record<SqlConnectionRequest['dialect'], number> = {
  postgresql: 5432,
  mysql: 3306,
}

const DIALECT_LABEL: Record<Dialect, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
}

export function ConnectDatabasePanel({
  prefill,
  onPrefillApplied,
}: {
  /** Set by a parent (e.g. a "Recent Connections" list elsewhere on the page) to drive this
   * form from outside — applied once via the effect below, then the parent is notified so
   * it can clear it and this component goes back to managing its own state normally. */
  prefill?: RecentSqlConnection | null
  onPrefillApplied?: () => void
}) {
  const { refreshSources, setActiveSourceId } = useAppState()
  const [dialect, setDialect] = useState<Dialect>('postgresql')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(String(DEFAULT_PORT.postgresql))
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [recent, setRecent] = useState<RecentSqlConnection[]>([])
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchRecentSqlConnections()
      .then(setRecent)
      .catch(() => undefined)
  }, [])

  function handleDialectChange(next: Dialect) {
    setDialect(next)
    if (next !== 'sqlite') setPort(String(DEFAULT_PORT[next]))
    setError(null)
  }

  function handlePickRecent(c: RecentSqlConnection) {
    setDialect(c.dialect)
    setHost(c.host)
    setPort(String(c.port))
    setDatabase(c.database)
    setUser(c.user)
    setDisplayName(c.display_name)
    setPassword('')
    setError(null)
    // The password is never remembered — jump focus straight there since everything else
    // is already filled in and that's the only field left for the user to type.
    passwordRef.current?.focus()
  }

  async function handleDeleteRecent(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setRecent((prev) => prev.filter((c) => c.id !== id))
    try {
      await deleteRecentSqlConnection(id)
    } catch {
      fetchRecentSqlConnections().then(setRecent).catch(() => undefined)
    }
  }

  useEffect(() => {
    if (!prefill) return
    handlePickRecent(prefill)
    onPrefillApplied?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  async function handleConnect() {
    if (dialect === 'sqlite') return
    if (!host || !database || !user) {
      setError('Host, database, and user are required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { source_id } = await connectSqlDataSource({
        dialect,
        host,
        port: Number(port) || DEFAULT_PORT[dialect],
        database,
        user,
        password,
        display_name: displayName || database,
      })
      await refreshSources()
      setActiveSourceId(source_id)
      fetchRecentSqlConnections().then(setRecent).catch(() => undefined)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSqliteFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { source_id } = await uploadSqliteFile(file)
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
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Database className="h-4 w-4 text-brand-500" />
        {dialect === 'sqlite'
          ? 'Connect a local SQLite database file.'
          : 'Connect a Postgres or MySQL database — tables stay live, queried directly, no copy.'}
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-200 p-1 dark:border-navy-700">
        {(['postgresql', 'mysql', 'sqlite'] as const).map((d) => (
          <button
            key={d}
            onClick={() => handleDialectChange(d)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              dialect === d
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-navy-900'
            }`}
          >
            {DIALECT_LABEL[d]}
          </button>
        ))}
      </div>

      {dialect !== 'sqlite' && recent.filter((c) => c.dialect === dialect).length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <History className="h-3.5 w-3.5" />
            Recent connections — password not saved, just click and re-enter it
          </div>
          <div className="flex flex-col gap-1">
            {recent
              .filter((c) => c.dialect === dialect)
              .map((c) => (
                <div
                  key={c.id}
                  onClick={() => handlePickRecent(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handlePickRecent(c)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-navy-900"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{c.display_name}</span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      {c.user}@{c.host}:{c.port}/{c.database}
                    </span>
                  </span>
                  <button
                    onClick={(e) => handleDeleteRecent(c.id, e)}
                    title="Forget this connection"
                    className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 dark:text-navy-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {dialect === 'sqlite' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleSqliteFile(e.dataTransfer.files)
          }}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-6 py-10 text-center dark:border-navy-700"
        >
          <UploadCloud className="h-8 w-8 text-brand-500" />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Drag & drop a .sqlite/.db file, or{' '}
            <button className="font-medium text-brand-600 hover:underline" onClick={() => fileInputRef.current?.click()}>
              browse
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.db,.sqlite3"
            className="hidden"
            onChange={(e) => handleSqliteFile(e.target.files)}
          />
          {busy && <div className="text-xs text-slate-400">Connecting…</div>}
        </div>
      ) : (
        <>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <div className="flex gap-2">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Host"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="Port"
              className="w-20 shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
            />
          </div>
          <input
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            placeholder="Database name"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="User"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
            />
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
          <p className="text-xs text-slate-400">
            Credentials are kept in memory only for this session and aren't written to disk —
            you'll need to reconnect if the backend restarts.
          </p>
        </>
      )}
      {error && <div className="text-xs text-rose-500">{error}</div>}
    </div>
  )
}
