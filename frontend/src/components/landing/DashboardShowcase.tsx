import { Layers, Megaphone, MessageCircleQuestion, Sparkles, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const card =
  'rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_8px_30px_rgba(30,41,59,0.06)] text-slate-900'

function CardHeader({ icon: Icon, title, aside }: { icon: LucideIcon; title: string; aside: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2.5 text-[15px] font-medium">
        <Icon className="h-4 w-4 shrink-0 text-violet-500" />
        {title}
      </div>
      <span className="shrink-0 text-sm text-slate-400">{aside}</span>
    </div>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-black px-2 py-0.5 text-xs font-medium text-white">{children}</span>
}

function Legend({ items, className = '' }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/* ---------- 1. Answer + bar chart ---------- */

const REGIONS = [
  { name: 'North', value: 18 },
  { name: 'South', value: 14 },
  { name: 'East', value: 28, highlight: true },
  { name: 'West', value: 22 },
  { name: 'Central', value: 18 },
]

function AnswerCard() {
  return (
    <div className={card}>
      <CardHeader
        icon={MessageCircleQuestion}
        title="Which region had the highest revenue last quarter?"
        aside="Last quarter"
      />
      <p className="mt-5 flex items-center gap-1.5 text-sm text-slate-400">
        <Sparkles className="h-3.5 w-3.5 text-violet-400" /> Answer
      </p>
      <p className="mt-1 max-w-xs text-xl font-semibold leading-snug">
        East led the quarter, ahead of every other region.
      </p>
      <code className="mt-3 inline-block rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] text-slate-500">
        SELECT region, SUM(revenue) … GROUP BY region
      </code>
      <div className="mt-6 flex h-[205px] items-end gap-3">
        {REGIONS.map((r) => (
          <div key={r.name} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-2 text-sm">{r.value}%</span>
            <div
              className="w-full rounded-xl"
              style={{
                height: r.value * 4.6,
                background: r.highlight
                  ? 'linear-gradient(180deg,#c4a1fb,#7c3aed)'
                  : 'linear-gradient(180deg,#f3eeff,#e2d8fb)',
              }}
            />
            <span className="mt-3 flex h-6 items-center text-sm text-slate-400">
              {r.highlight ? <Pill>{r.name}</Pill> : r.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- 2. Stacked growth ---------- */

const LAYERS = [
  { name: 'Hardware', color: '#6f7cf4' },
  { name: 'Software', color: '#a259f0' },
  { name: 'Services', color: '#e75bdc' },
  { name: 'Support', color: '#ee6b78' },
  { name: 'Other', color: '#f6b73c' },
]
const STACKS = [
  { x: 0, label: 'Q1', total: '$3.1M', heights: [26, 14, 9, 6, 4] },
  { x: 268, label: 'Q2', total: '$6.6M', heights: [48, 26, 18, 12, 8] },
  { x: 536, label: 'Q3', total: '$10.5M', heights: [78, 44, 30, 20, 12], highlight: true },
]
const STACK_W = 64
const BASE = 285
const SCALE = 1.5

function stackEdges(heights: number[]) {
  let y = BASE
  return heights.map((h) => {
    const bottom = y
    y -= h * SCALE
    return { top: y, bottom }
  })
}

function GrowthCard() {
  const edges = STACKS.map((s) => stackEdges(s.heights))
  return (
    <div className={`${card} flex flex-col`}>
      <CardHeader icon={TrendingUp} title="How is revenue growing?" aside="$M, by line" />
      <Legend items={LAYERS.map((l) => ({ label: l.name, color: l.color }))} className="mt-4" />
      <svg viewBox="0 0 600 335" className="mt-auto w-full pt-3" role="img" aria-label="Stacked revenue by product line over three quarters">
        {STACKS.slice(0, -1).map((s, i) =>
          LAYERS.map((layer, k) => {
            const a = edges[i][k]
            const b = edges[i + 1][k]
            const x1 = s.x + STACK_W
            const x2 = STACKS[i + 1].x
            return (
              <polygon
                key={`${i}-${layer.name}`}
                points={`${x1},${a.top} ${x2},${b.top} ${x2},${b.bottom} ${x1},${a.bottom}`}
                fill={layer.color}
                fillOpacity={0.16}
              />
            )
          }),
        )}
        {STACKS.map((s, i) => (
          <g key={s.label}>
            {LAYERS.map((layer, k) => (
              <rect
                key={layer.name}
                x={s.x}
                y={edges[i][k].top}
                width={STACK_W}
                height={s.heights[k] * SCALE - 3}
                rx={5}
                fill={layer.color}
              />
            ))}
            <text
              x={s.x + (i === 0 ? 0 : i === STACKS.length - 1 ? STACK_W : STACK_W / 2)}
              y={edges[i][4].top - 14}
              textAnchor={i === 0 ? 'start' : i === STACKS.length - 1 ? 'end' : 'middle'}
              fontSize="15"
              fill="#1f2937"
            >
              {s.label}
            </text>
            {s.highlight ? (
              <>
                <rect x={s.x - 6} y={BASE + 14} width={STACK_W + 6} height={26} rx={7} fill="#000" />
                <text x={s.x + STACK_W / 2 - 3} y={BASE + 32} textAnchor="middle" fontSize="14" fill="#fff">
                  {s.total}
                </text>
              </>
            ) : (
              <text
                x={s.x + (i === 0 ? 0 : STACK_W / 2)}
                y={BASE + 32}
                textAnchor={i === 0 ? 'start' : 'middle'}
                fontSize="14"
                fill="#94a3b8"
              >
                {s.total}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ---------- 3. Rounded-square scatter ---------- */

const CAMPAIGNS = [
  { n: 118, left: '3%', top: 6, size: 38, bg: 'linear-gradient(160deg,#c3c3cb,#8e8e99)' },
  { n: 210, left: '21%', top: 84, size: 54, bg: 'linear-gradient(160deg,#f08a73,#dc4f42)' },
  { n: 189, left: '17.5%', top: 124, size: 46, bg: 'linear-gradient(160deg,#fbc77a,#f6a23c)' },
  { n: 216, left: '26%', top: 122, size: 48, bg: 'linear-gradient(160deg,#ec6ae2,#b743d8)' },
  { n: 453, left: '61%', top: 40, size: 66, bg: 'linear-gradient(160deg,#7f8cf5,#4b52e3)' },
  { n: 528, left: '74%', top: 12, size: 74, bg: 'linear-gradient(160deg,#b78bf7,#7c3aed)', pill: true },
]

function ScatterCard() {
  return (
    <div className={card}>
      <CardHeader icon={Megaphone} title="Which campaigns convert best?" aside="↑ conversion  → spend" />
      <Legend
        className="mt-4"
        items={[
          { label: 'Email', color: '#ee6b78' },
          { label: 'Search', color: '#f6b73c' },
          { label: 'Social', color: '#e75bdc' },
          { label: 'Display', color: '#9a9aa6' },
          { label: 'Affiliate', color: '#6f7cf4' },
          { label: 'Events', color: '#a259f0' },
        ]}
      />
      <div className="relative mt-5 h-[250px]">
        {[
          ['5.0', 0],
          ['4.6', 52],
          ['4.2', 104],
          ['3.8', 156],
        ].map(([label, top]) => (
          <div key={label} className="absolute inset-x-0" style={{ top: Number(top) + 12 }}>
            <span className="absolute -top-2.5 left-0 text-sm text-slate-400">{label}</span>
            <div className="ml-10 border-t border-dashed border-slate-200" />
          </div>
        ))}
        <div className="absolute inset-y-0 left-10 right-0">
          {CAMPAIGNS.map((c) => (
            <div
              key={c.n}
              className="absolute flex items-center justify-center rounded-[14px] text-sm font-medium text-white shadow-[0_6px_16px_rgba(30,41,59,0.12)]"
              style={{ left: c.left, top: c.top, width: c.size, height: c.size, background: c.bg }}
            >
              {c.pill ? <Pill>{c.n}</Pill> : c.n}
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-[200px] ml-10 flex justify-between pr-2 text-sm text-slate-400">
          {['120K', '240K', '360K', '480K', '600K'].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- 4. Donut ---------- */

const CHANNELS = [
  { name: 'Online', value: 38, fill: 'url(#plRed)', dot: '#e2493d', highlight: true },
  { name: 'Retail', value: 10.9, fill: '#fde8cf', dot: '#fbbf77' },
  { name: 'Partners', value: 7.4, fill: '#fbe4f6', dot: '#e879f9' },
  { name: 'Wholesale', value: 4.1, fill: '#ebe5fb', dot: '#a78bfa' },
  { name: 'Other', value: 2.7, fill: '#f0edfc', dot: '#818cf8' },
]

function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`
}

function DonutCard() {
  const total = CHANNELS.reduce((sum, c) => sum + c.value, 0)
  const cx = 150
  const cy = 150
  const outer = 142
  const inner = 84
  const round = 5 // stroke trick: inset the sector, then stroke it round to soften the corners
  const gap = 0.03
  const segments = CHANNELS.map((c, i) => {
    const before = CHANNELS.slice(0, i).reduce((sum, x) => sum + x.value, 0)
    const start = -Math.PI / 2 + (before / total) * Math.PI * 2
    const span = (c.value / total) * Math.PI * 2
    const a0 = start + gap / 2
    const a1 = start + span - gap / 2
    const mid = (a0 + a1) / 2
    const pad0 = round / inner
    const pad1 = round / outer
    return {
      ...c,
      path: sector(cx, cy, inner + round, outer - round, a0 + pad0, a1 - pad1),
      lx: cx + ((inner + outer) / 2) * Math.cos(mid),
      ly: cy + ((inner + outer) / 2) * Math.sin(mid),
    }
  })
  return (
    <div className={card}>
      <CardHeader icon={Layers} title="Where does revenue come from?" aside="$M, by channel" />
      <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="sm:w-[44%]">
          <p className="text-sm text-slate-500">Total revenue</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">$63.1M</p>
          <ul className="mt-8 space-y-2.5 text-sm text-slate-500">
            {CHANNELS.map((c) => (
              <li key={c.name} className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: c.dot }} />
                {c.name}
              </li>
            ))}
          </ul>
        </div>
        <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[290px] sm:w-[56%]" role="img" aria-label="Revenue share by channel">
          <defs>
            <linearGradient id="plRed" x1="0.1" y1="0" x2="0.8" y2="1">
              <stop offset="0" stopColor="#f4958d" />
              <stop offset="1" stopColor="#d3261b" />
            </linearGradient>
          </defs>
          {segments.map((s) => (
            <path
              key={s.name}
              d={s.path}
              fill={s.fill}
              stroke={s.fill}
              strokeWidth={round * 2}
              strokeLinejoin="round"
            />
          ))}
          {segments.map((s) =>
            s.highlight ? (
              <g key={s.name}>
                <rect x={s.lx - 17} y={s.ly - 13} width={34} height={26} rx={7} fill="#000" />
                <text x={s.lx} y={s.ly + 5} textAnchor="middle" fontSize="14" fill="#fff">
                  {s.value}
                </text>
              </g>
            ) : (
              <text key={s.name} x={s.lx} y={s.ly + 5} textAnchor="middle" fontSize="14" fill="#374151">
                {s.value.toString().replace('.', ',')}
              </text>
            ),
          )}
        </svg>
      </div>
    </div>
  )
}

/** A light dashboard panel of four insight cards, in the style of an analytics report. The numbers
 * are illustrative. */
export default function DashboardShowcase() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-indigo-500/25 via-fuchsia-500/20 to-cyan-400/15 blur-3xl"
      />
      <div
        className="rounded-[2rem] bg-[#f6f6fa] p-4 sm:p-7"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.14) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <AnswerCard />
          <GrowthCard />
          <ScatterCard />
          <DonutCard />
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Illustrative example</p>
    </div>
  )
}
