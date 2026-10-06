import type { QueryResultData } from '../../types'
import { formatValue, humanizeFieldName } from '../../lib/format'

export function ResultTable({ result }: { result: QueryResultData }) {
  if (result.rows.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-400">No rows returned.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-navy-700">
            {result.columns.map((col) => (
              <th
                key={col.name}
                className="whitespace-nowrap px-4 py-2 font-medium text-slate-500 dark:text-slate-400"
              >
                {humanizeFieldName(col.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-100 last:border-0 dark:border-navy-800"
            >
              {result.columns.map((col) => (
                <td
                  key={col.name}
                  className="whitespace-nowrap px-4 py-2 text-slate-700 tabular-nums dark:text-slate-300"
                >
                  {formatValue(row[col.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-navy-800">
          Results truncated to {result.rows.length} rows.
        </div>
      )}
    </div>
  )
}
