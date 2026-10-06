import type { QueryAnswer } from '../types'
import { formatValue, humanizeFieldName } from './format'

export type InsightIcon = 'objective' | 'stats' | 'leader' | 'drivers' | 'warning'

export interface InsightCard {
  icon: InsightIcon
  title: string
  description: string
}

function buildSuggestion(answer: QueryAnswer): string {
  const { result, chart_spec: spec } = answer
  const xField = spec.x_field
  const yField = spec.y_fields[0]
  const yLabel = yField ? humanizeFieldName(yField) : 'this metric'

  if (!xField || !yField) {
    return `Ask a follow-up like "which customer segment drives the most revenue" to turn this into an action you can take on sales.`
  }

  const numericRows = result.rows
    .map((r) => ({ x: String(r[xField]), y: Number(r[yField]) }))
    .filter((r) => !Number.isNaN(r.y))

  if (numericRows.length < 2) {
    return `Not enough data points to spot a pattern yet — widen the date range or remove filters to get a clearer read on what's driving ${yLabel}.`
  }

  const isTimeLike = /time|date|day|month|year/i.test(xField)
  const average = (rows: typeof numericRows) => rows.reduce((s, r) => s + r.y, 0) / rows.length

  if (isTimeLike && numericRows.length >= 4) {
    const mid = Math.floor(numericRows.length / 2)
    const firstAvg = average(numericRows.slice(0, mid))
    const secondAvg = average(numericRows.slice(mid))
    const change = firstAvg !== 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0

    if (change <= -10) {
      return `${yLabel} has dropped ${Math.abs(change).toFixed(0)}% from the earlier part of this range to the latest — a limited-time discount, bundle offer, or re-engagement email could help win back that lost momentum.`
    }
    if (change >= 10) {
      return `${yLabel} is up ${change.toFixed(0)}% in the more recent period — a good time to boost stock and staffing so you don't run short, and to double down on whatever's driving the growth (channel, promo, or product).`
    }
    return `${yLabel} has stayed roughly flat over this range — try a time-limited promotion or a new bundle to break the plateau and create fresh demand.`
  }

  const total = numericRows.reduce((s, r) => s + r.y, 0)
  const sorted = [...numericRows].sort((a, b) => b.y - a.y)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  const topShare = total !== 0 ? (top.y / total) * 100 : 0

  if (topShare >= 40) {
    return `${top.x} alone drives ${topShare.toFixed(0)}% of total ${yLabel} — bundle or upsell around it to capture more value, but also invest in your next-best performers so you're not overexposed to a single one.`
  }
  return `${bottom.x} is your weakest performer on ${yLabel} — try a targeted discount, better placement, or pairing it with ${top.x} (your top performer) to lift it.`
}

/** Groups rows by whichever field actually explains variation in this chart — the series
 * breakdown if there is one, otherwise the x-axis category — and finds the smallest set of
 * top contributors that account for most of the total, so we can name them as the "drivers"
 * with a real reason (their combined share) rather than just listing the single top row. */
function buildDriversCard(answer: QueryAnswer): InsightCard | null {
  const { result, chart_spec: spec } = answer
  const yField = spec.y_fields[0]
  const groupField = spec.series_field ?? spec.x_field
  if (!yField || !groupField) return null

  const totals = new Map<string, number>()
  for (const row of result.rows) {
    const value = Number(row[yField])
    if (Number.isNaN(value)) continue
    const key = String(row[groupField])
    totals.set(key, (totals.get(key) ?? 0) + value)
  }

  // With only 1-2 groups, "drivers" is just the leader card restated — not worth a second card.
  if (totals.size < 3) return null

  const total = Array.from(totals.values()).reduce((s, v) => s + v, 0)
  if (total <= 0) return null

  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  const drivers: string[] = []
  let cumulative = 0
  for (const [name, value] of sorted) {
    drivers.push(name)
    cumulative += value
    if (cumulative / total >= 0.6 || drivers.length >= 3) break
  }

  const share = (cumulative / total) * 100
  const groupLabel = humanizeFieldName(groupField)
  const yLabel = humanizeFieldName(yField)
  const driverList =
    drivers.length > 1 ? `${drivers.slice(0, -1).join(', ')} and ${drivers[drivers.length - 1]}` : drivers[0]

  return {
    icon: 'drivers',
    title: `Key drivers of ${yLabel}`,
    description: `${driverList} — just ${drivers.length} of ${totals.size} ${groupLabel} values — account for ${share.toFixed(0)}% of total ${yLabel}. The remaining ${totals.size - drivers.length} contribute only ${(100 - share).toFixed(0)}% combined.`,
  }
}

export function buildInsightCards(answer: QueryAnswer): InsightCard[] {
  const { result, chart_spec: spec, execution_ms } = answer
  const cards: InsightCard[] = [
    { icon: 'objective', title: 'Ideas to grow this', description: buildSuggestion(answer) },
    {
      icon: 'stats',
      title: 'Result size',
      description: `${result.row_count} row${result.row_count === 1 ? '' : 's'} returned in ${execution_ms.toFixed(0)}ms.`,
    },
  ]

  if (spec.x_field && spec.y_fields[0] && result.rows.length > 1) {
    const yField = spec.y_fields[0]
    const numericRows = result.rows
      .map((r) => ({ x: r[spec.x_field as string], y: Number(r[yField]) }))
      .filter((r) => !Number.isNaN(r.y))

    if (numericRows.length > 1) {
      const total = numericRows.reduce((sum, r) => sum + r.y, 0)
      const top = numericRows.reduce((a, b) => (b.y > a.y ? b : a))
      const average = total / numericRows.length
      const share = total !== 0 ? (top.y / total) * 100 : 0
      const shareLabel = share > 0 && share < 1 ? '<1' : share.toFixed(0)
      const vsAverage = average !== 0 ? ((top.y - average) / average) * 100 : 0
      const xLabel = humanizeFieldName(spec.x_field)
      const yLabel = humanizeFieldName(yField)
      cards.push({
        icon: 'leader',
        title: `Highest ${yLabel}: ${top.x}`,
        description: `${formatValue(top.y)} (${shareLabel}% of the total across ${numericRows.length} ${xLabel} values) — ${
          vsAverage >= 0 ? `${vsAverage.toFixed(0)}% above` : `${Math.abs(vsAverage).toFixed(0)}% below`
        } the average of ${formatValue(average)}.`,
      })
    }
  }

  const driversCard = buildDriversCard(answer)
  if (driversCard) cards.push(driversCard)

  if (result.truncated) {
    cards.push({
      icon: 'warning',
      title: 'Results truncated',
      description: `Only the first ${result.rows.length} rows are shown — refine the question to narrow it down.`,
    })
  }

  return cards
}

export function buildInsights(answer: QueryAnswer): string[] {
  return buildInsightCards(answer).map((c) => c.description)
}
