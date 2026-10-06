/** Finds numeric literals in a SQL string that make sense to expose as a "what-if" slider —
 * skips anything inside a string literal and any number that's part of a LIMIT clause (row
 * caps aren't a business parameter). Character offsets are into the *original* string, so a
 * literal can be swapped back in place without re-parsing the whole query. */
export interface AdjustableLiteral {
  value: number
  start: number
  end: number
  /** A short snippet of surrounding SQL so the user can tell what the number controls. */
  context: string
}

const CONTEXT_RADIUS = 24

export function findAdjustableLiterals(sql: string): AdjustableLiteral[] {
  const stripped = sql.replace(/'(?:[^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length))
  const results: AdjustableLiteral[] = []
  const re = /\b\d+(\.\d+)?\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(stripped))) {
    const before = stripped.slice(Math.max(0, match.index - 8), match.index)
    if (/limit\s*$/i.test(before)) continue
    const start = match.index
    const end = start + match[0].length
    const context =
      (start > 0 ? '…' : '') +
      sql.slice(Math.max(0, start - CONTEXT_RADIUS), start) +
      '▍' +
      sql.slice(end, Math.min(sql.length, end + CONTEXT_RADIUS)) +
      (end < sql.length ? '…' : '')
    results.push({ value: Number(match[0]), start, end, context })
  }
  return results
}

export function substituteLiteral(sql: string, literal: AdjustableLiteral, newValue: number): string {
  const formatted = Number.isInteger(newValue) ? String(newValue) : newValue.toFixed(2)
  return sql.slice(0, literal.start) + formatted + sql.slice(literal.end)
}
