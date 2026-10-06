import { Link2, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createTableRelationship,
  deleteTableRelationship,
  extractErrorMessage,
  fetchTableRelationships,
  getSourceSchema,
} from '../../api/client'
import type { SchemaInfo, TableRelationship } from '../../types'

/** Lets the user tell PowerLens how two tables on a source actually join (e.g.
 * `orders.customer_id = customers.id`) so the NL→SQL prompt can use that exact key instead of
 * having the model guess one from column-name conventions — a real, if manual, substitute for
 * the relationship model a proper semantic layer (like Power BI's) would infer automatically. */
export function TableRelationshipsModal({ sourceId, sourceName, onClose }: { sourceId: string; sourceName: string; onClose: () => void }) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [relationships, setRelationships] = useState<TableRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableA, setTableA] = useState('')
  const [columnA, setColumnA] = useState('')
  const [tableB, setTableB] = useState('')
  const [columnB, setColumnB] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getSourceSchema(sourceId), fetchTableRelationships(sourceId)])
      .then(([s, rels]) => {
        setSchema(s)
        setRelationships(rels)
        if (s.tables.length > 0) setTableA(s.tables[0].name)
        if (s.tables.length > 1) setTableB(s.tables[1].name)
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [sourceId])

  const columnsFor = (tableName: string) => schema?.tables.find((t) => t.name === tableName)?.columns ?? []

  useEffect(() => {
    setColumnA(columnsFor(tableA)[0]?.name ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableA, schema])

  useEffect(() => {
    setColumnB(columnsFor(tableB)[0]?.name ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableB, schema])

  async function handleAdd() {
    if (!tableA || !columnA || !tableB || !columnB) return
    setSaving(true)
    setError(null)
    try {
      const created = await createTableRelationship(sourceId, { tableA, columnA, tableB, columnB })
      setRelationships((prev) => [...prev, created])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setRelationships((prev) => prev.filter((r) => r.id !== id))
    try {
      await deleteTableRelationship(sourceId, id)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-navy-800"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-700">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Table relationships</h2>
            <p className="text-xs text-slate-400">{sourceName} — helps multi-table questions join correctly</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-slate-400">Loading schema…</p>
          ) : !schema || schema.tables.length < 2 ? (
            <p className="text-sm text-slate-400">This source needs at least two tables to define a relationship.</p>
          ) : (
            <>
              <div className="mb-5 rounded-xl border border-slate-200 p-4 dark:border-navy-700">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Table</label>
                    <select
                      value={tableA}
                      onChange={(e) => setTableA(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200 dark:[color-scheme:dark]"
                    >
                      {schema.tables.map((t) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Column</label>
                    <select
                      value={columnA}
                      onChange={(e) => setColumnA(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200 dark:[color-scheme:dark]"
                    >
                      {columnsFor(tableA).map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="my-2 flex items-center justify-center text-slate-300">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Table</label>
                    <select
                      value={tableB}
                      onChange={(e) => setTableB(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200 dark:[color-scheme:dark]"
                    >
                      {schema.tables.map((t) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Column</label>
                    <select
                      value={columnB}
                      onChange={(e) => setColumnB(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200 dark:[color-scheme:dark]"
                    >
                      {columnsFor(tableB).map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={saving || tableA === tableB}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add relationship
                </button>
                {tableA === tableB && <p className="mt-1 text-xs text-amber-500">Pick two different tables.</p>}
              </div>

              {relationships.length === 0 ? (
                <p className="text-sm text-slate-400">No relationships defined yet.</p>
              ) : (
                <ul className="space-y-2">
                  {relationships.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-700"
                    >
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {r.tableA}.{r.columnA} = {r.tableB}.{r.columnB}
                      </span>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
