import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Cloud,
  CloudOff,
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  Lock,
  MessageCircleQuestion,
  Radio,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'

const APP_HREF = '/dashboards'

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#sources', label: 'Data sources' },
  { href: '#privacy', label: 'Privacy' },
]

interface Feature {
  icon: LucideIcon
  title: string
  body: string
}

const HERO_CARDS: Feature[] = [
  {
    icon: MessageCircleQuestion,
    title: 'Ask Your Data',
    body: 'Plain-English questions in, SQL and the right chart out. No query language required.',
  },
  {
    icon: TrendingUp,
    title: 'Predictive Forecasting',
    body: 'Project any measure 3, 6 or 12 periods ahead and spot opportunities before they happen.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by Design',
    body: 'AI runs on a local model through Ollama, so your data is not sent to a third-party AI service.',
  },
]

interface BentoFeature extends Feature {
  /** Wide cards carry a checklist; the rest are compact icon tiles. */
  points?: string[]
}

const FEATURES: BentoFeature[] = [
  {
    icon: MessageCircleQuestion,
    title: 'Ask your data',
    body: 'Type a question in plain English. PowerLens writes the SQL, runs it, and picks the right chart or table for the answer.',
    points: ['No SQL knowledge required', 'Inspect the exact query that ran', 'Charts and tables chosen for you'],
  },
  {
    icon: BarChart3,
    title: 'AI dashboards',
    body: 'Describe what you want to monitor and get a full dashboard of KPIs and charts, then refine it by chatting.',
  },
  {
    icon: BrainCircuit,
    title: 'AI analyst',
    body: 'Profiles your dataset, detects its business domain and surfaces the signals worth a look first.',
  },
  {
    icon: TrendingUp,
    title: 'Forecasts',
    body: 'Project any numeric measure forward and see the trend next to your history.',
  },
  {
    icon: FileText,
    title: 'Reports',
    body: 'Turn dashboards into clean, print-ready reports for people who just want the summary.',
  },
  {
    icon: Share2,
    title: 'Share with a link',
    body: 'Publish a read-only snapshot of any dashboard to a single link, and take it down whenever you like.',
    points: ['Read-only view of your live charts', 'Anyone with the link can open it', 'Revoke access at any time'],
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Connect your data',
    body: 'Upload a spreadsheet, point at a database, or pull from a REST API. Relationships between tables are detected for you.',
  },
  {
    n: '02',
    title: 'Ask or describe',
    body: 'Ask a question, request a dashboard, or let the AI analyst tell you what stands out in your data.',
  },
  {
    n: '03',
    title: 'Act on the answer',
    body: 'Inspect the generated SQL, explore the insights, forecast what comes next, then share or export the result.',
  },
]

interface Source extends Feature {
  formats: string[]
  from: string
  to: string
}

const SOURCES: Source[] = [
  {
    icon: FileSpreadsheet,
    title: 'Files',
    body: 'Drag and drop a spreadsheet and start asking.',
    formats: ['.csv', '.xlsx', '.xls'],
    from: '#10b981',
    to: '#14b8a6',
  },
  {
    icon: Database,
    title: 'Databases',
    body: 'Tables stay live and are queried in place.',
    formats: ['PostgreSQL', 'MySQL', 'SQLite'],
    from: '#3b82f6',
    to: '#6366f1',
  },
  {
    icon: Cloud,
    title: 'Cloud & URLs',
    body: 'Load files straight from storage or a link.',
    formats: ['S3', 'HTTP'],
    from: '#06b6d4',
    to: '#8b5cf6',
  },
  {
    icon: Radio,
    title: 'REST APIs',
    body: 'Pull a JSON endpoint into your workspace.',
    formats: ['REST', 'JSON'],
    from: '#d946ef',
    to: '#ec4899',
  },
]

const PRIVACY_POINTS: Feature[] = [
  {
    icon: ShieldCheck,
    title: 'Local AI inference',
    body: 'Natural-language questions are answered by a model running on your machine.',
  },
  {
    icon: Lock,
    title: 'Guarded queries',
    body: 'Generated SQL is validated before it runs, and you can always inspect exactly what was executed.',
  },
  {
    icon: Share2,
    title: 'Sharing on your terms',
    body: 'Dashboards are private until you create a share link, and you can revoke it at any time.',
  },
]

/** Brand mark: a lens with a rising trend line inside it, on a glassy gradient tile. Mirrors
 * public/favicon.svg. */
function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="plm-bg" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.45" stopColor="#6366f1" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
        <linearGradient id="plm-shine" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#plm-bg)" />
      <rect width="48" height="48" rx="13" fill="url(#plm-shine)" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" stroke="#fff" strokeOpacity="0.28" />
      <circle cx="21" cy="21" r="11.5" fill="#0b1030" fillOpacity="0.25" stroke="#fff" strokeWidth="3" />
      <polyline
        points="14.5,25.5 19,20.5 23,23.5 28,16.5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="16.5" r="2" fill="#a5f3fc" />
      <line x1="29.5" y1="29.5" x2="38.5" y2="38.5" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M37 6.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fff" fillOpacity="0.95" />
    </svg>
  )
}

function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark className="h-9 w-9 drop-shadow-[0_0_14px_rgba(129,140,248,0.55)]" />
      <span className="text-lg font-bold uppercase tracking-[0.12em]">
        Power
        <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
          Lens
        </span>
      </span>
    </span>
  )
}

/** Glass panel with the soft glowing top/bottom edge lines from the reference design. */
function GlowCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`group relative rounded-2xl border border-violet-300/25 bg-white/[0.03] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-violet-300/50 hover:bg-white/[0.06] ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent opacity-70 transition-opacity group-hover:opacity-100"
      />
      <span
        aria-hidden
        className="absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent opacity-50 transition-opacity group-hover:opacity-90"
      />
      {children}
    </div>
  )
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-slate-400">{body}</p>}
    </div>
  )
}

const HeroVortex = lazy(() => import('../components/landing/HeroVortex'))

const DashboardShowcase = lazy(() => import('../components/landing/DashboardShowcase'))

interface MiniCardProps {
  icon: LucideIcon
  tint: string
  name: string
  time: string
  text: string
  tilt: number
  className: string
  delay?: string
  faded?: boolean
}

/** A small floating activity card, tilted and gently drifting. */
function MiniCard({ icon: Icon, tint, name, time, text, tilt, className, delay = '0s', faded = false }: MiniCardProps) {
  return (
    <div
      className={`pl-drift absolute w-[264px] rounded-xl bg-white p-3 text-left shadow-[0_6px_20px_rgba(30,41,59,0.07)] ${faded ? 'opacity-75' : ''} ${className}`}
      style={{ '--r': `${tilt}deg`, animationDelay: delay } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: tint }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex items-baseline gap-2 text-[13px] text-slate-500">
            <span className="truncate font-medium">{name}</span>
            <span className="text-[11px] text-slate-400">{time}</span>
          </p>
          <p className="mt-0.5 truncate text-[13px] text-slate-800">{text}</p>
        </div>
      </div>
    </div>
  )
}

/** Closing call to action: a light card with a pill badge, a bold headline, a stage of floating
 * activity cards around the answer PowerLens just gave, and the button. */
function CtaSection() {
  return (
    <section className="relative isolate px-6 py-24 sm:py-28">
      <div aria-hidden className="absolute inset-x-0 top-1/2 -z-10 mx-auto h-[420px] max-w-4xl -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-600/30 via-fuchsia-500/25 to-cyan-400/20 blur-[100px]" />
      <div className="mx-auto max-w-[1180px]">
        <div className="rounded-[2rem] bg-[#f5f6f8] px-5 pb-14 pt-14 text-center text-slate-900 sm:px-10 sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-[0_2px_8px_rgba(30,41,59,0.06)]">
            <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
            Your data, your machine
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Ask your data anything,
            <br />
            get answers in seconds
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-slate-500">
            PowerLens handles the SQL, charts and forecasts so you can focus on the decisions that grow your business.
          </p>

          <div className="relative mx-auto mt-12 h-[320px] max-w-4xl overflow-hidden rounded-[1.75rem] border border-white bg-gradient-to-b from-white/80 to-sky-50/80 shadow-[inset_0_0_40px_rgba(148,163,184,0.12),0_10px_40px_rgba(148,163,184,0.12)]">
            <div className="absolute left-1/2 top-5 flex -translate-x-1/2 gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-md">
                <Database className="h-5 w-5" />
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
            </div>

            <MiniCard
              icon={TrendingUp}
              tint="linear-gradient(135deg,#a78bfa,#7c3aed)"
              name="Forecast"
              time="1hr ago"
              text="Revenue up 12% next quarter"
              tilt={-4}
              faded
              className="left-[6%] top-[22%] hidden sm:block"
            />
            <MiniCard
              icon={BarChart3}
              tint="linear-gradient(135deg,#60a5fa,#4f46e5)"
              name="Dashboard"
              time="2w ago"
              text="6 charts built from your sheet"
              tilt={6}
              delay="-2s"
              faded
              className="bottom-[8%] left-[10%] hidden sm:block"
            />
            <MiniCard
              icon={Share2}
              tint="linear-gradient(135deg,#f472b6,#d946ef)"
              name="Report shared"
              time="1hr ago"
              text="Read-only link created"
              tilt={4}
              delay="-4s"
              faded
              className="right-[4%] top-[20%] hidden sm:block"
            />
            <MiniCard
              icon={ShieldCheck}
              tint="linear-gradient(135deg,#34d399,#0d9488)"
              name="Query checked"
              time="20min ago"
              text="Read-only SQL, safe to run"
              tilt={-3}
              delay="-1s"
              className="bottom-[10%] right-[10%] hidden sm:block"
            />

            <div className="absolute left-1/2 top-[48%] w-[260px] -translate-x-1/2">
              <span className="relative z-10 mx-auto -mb-2.5 block w-fit rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">
                Answered by PowerLens
              </span>
              <div className="rounded-xl bg-white p-3 text-left shadow-[0_10px_30px_rgba(30,41,59,0.12)]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="flex items-baseline gap-2 text-[13px] text-slate-700">
                      <span className="font-semibold">You asked</span>
                      <span className="text-[11px] text-slate-400">just now</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-slate-900">Which region earned the most?</p>
                    <p className="mt-0.5 text-[12px] font-medium text-violet-600">East led the quarter · 28%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Link
            to={APP_HREF}
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#5b4ee0] px-7 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,78,224,0.35)] ring-1 ring-inset ring-white/20 transition-colors hover:bg-[#4d41cc] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f6f8]"
          >
            Open PowerLens <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

/** One stop in the privacy flow: an icon tile, a title and a short caption. */
function FlowNode({ icon: Icon, title, sub, tint }: { icon: LucideIcon; title: string; sub: string; tint: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[#0e0f2c] p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ background: `linear-gradient(135deg, ${tint}, ${tint}99)`, boxShadow: `0 8px 20px -8px ${tint}` }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  )
}

/** A short line between flow nodes with a light pulse travelling along it. */
function FlowConnector() {
  return (
    <div
      aria-hidden
      className="relative mx-auto h-8 w-px bg-gradient-to-b from-violet-300/10 via-violet-300/50 to-violet-300/10 sm:mx-0 sm:h-px sm:w-12 sm:bg-gradient-to-r lg:w-14"
    >
      <span className="pl-flow" />
    </div>
  )
}

export function LandingPage() {
  useEffect(() => {
    document.title = 'PowerLens — Intelligence powered by data'
  }, [])

  return (
    <div className="relative min-h-screen scroll-smooth overflow-x-hidden bg-[#070820] text-slate-200 antialiased">
      {/* Ambient background glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full bg-violet-700/25 blur-[140px]" />
        <div className="absolute -left-48 top-[520px] h-[520px] w-[520px] rounded-full bg-indigo-700/20 blur-[140px]" />
        <div className="absolute -bottom-40 right-0 h-[560px] w-[560px] rounded-full bg-fuchsia-700/15 blur-[150px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070820]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 sm:px-10">
          <a href="#top" aria-label="PowerLens home" className="text-white">
            <Logo />
          </a>
          <nav className="hidden items-center gap-10 lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-[15px] text-slate-200 transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
          </nav>
          <Link
            to={APP_HREF}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#8f7df0] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(143,125,240,0.45)] transition-all hover:bg-[#a193f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070820]"
          >
            Open App
          </Link>
        </div>
      </header>

      {/* Hero: fills the first screen */}
      <section id="top" className="relative z-10 flex min-h-[calc(100svh-5rem)] flex-col">
        <div className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-4 px-6 py-6 sm:px-10 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <h1 className="text-4xl font-medium leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Intelligence
              <br />
              Powered by Data
            </h1>
            <p className="mt-7 max-w-lg text-xl leading-relaxed text-slate-300 sm:text-2xl">
              AI-driven analytics for smarter business decisions. Ask in plain English, get answers.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to={APP_HREF}
                className="inline-flex items-center gap-2 rounded-md bg-[#8f7df0] px-8 py-4 text-lg font-semibold text-white shadow-[0_0_36px_rgba(143,125,240,0.55)] transition-all hover:bg-[#a193f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070820]"
              >
                Open PowerLens <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#how-it-works" className="px-4 py-4 text-lg text-slate-200 transition-colors hover:text-white">
                See how it works
              </a>
            </div>
          </div>
          <Suspense fallback={<div className="aspect-square w-full max-w-[760px]" />}>
            <HeroVortex />
          </Suspense>
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-6 pb-10 sm:px-10">
          <div className="grid gap-5 md:grid-cols-3">
            {HERO_CARDS.map(({ icon: Icon, title, body }) => (
              <GlowCard key={title} className="px-6 py-7 text-center">
                <Icon className="mx-auto h-9 w-9 text-white" strokeWidth={1.5} />
                <h3 className="mt-4 text-xl font-medium text-white">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{body}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-[1180px] px-6">
        {/* Product preview */}
        <section className="py-28">
          <Suspense fallback={<div className="h-[640px]" />}>
            <DashboardShowcase />
          </Suspense>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-8 pb-28">
          <SectionHeading
            eyebrow="Features"
            title="Everything between raw data and a decision"
            body="One workspace to connect, explore, forecast and share, powered by AI that shows its work."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body, points }, index) =>
              points ? (
                <div
                  key={title}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15162a] p-8 transition-colors hover:border-violet-300/30 sm:col-span-2"
                >
                  {index === FEATURES.length - 1 && (
                    <LogoMark className="pointer-events-none absolute -bottom-12 -right-10 h-64 w-64 opacity-[0.06] grayscale" />
                  )}
                  <h3 className="relative text-2xl font-medium text-white">{title}</h3>
                  <p className="relative mt-3 max-w-md text-sm leading-relaxed text-slate-400">{body}</p>
                  <ul className="relative mt-6 space-y-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-center gap-3 text-sm text-slate-300">
                        <Check className="h-4 w-4 shrink-0 text-violet-300" strokeWidth={2.5} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  key={title}
                  className="group flex min-h-[270px] flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#15162a] p-7 transition-colors hover:border-violet-300/30"
                >
                  <Icon
                    className="h-14 w-14 text-slate-500 transition-colors group-hover:text-violet-300"
                    strokeWidth={1.75}
                  />
                  <div>
                    <h3 className="text-2xl font-medium text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-8 pb-28">
          <SectionHeading eyebrow="How it works" title="From data to insight in three steps" />
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <GlowCard className="h-full p-7">
                  <span className="bg-gradient-to-br from-cyan-300 via-violet-400 to-fuchsia-400 bg-clip-text text-5xl font-semibold text-transparent">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-xl font-medium text-white">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-400">{s.body}</p>
                </GlowCard>
              </li>
            ))}
          </ol>
        </section>

        {/* Data sources */}
        <section id="sources" className="scroll-mt-8 pb-28">
          <SectionHeading
            eyebrow="Data sources"
            title="Bring the data you already have"
            body="Database tables stay live and are queried directly, with no copies and no stale exports."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCES.map(({ icon: Icon, title, body, formats, from, to }) => (
              <div
                key={title}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/25"
              >
                <div
                  aria-hidden
                  className="absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-60"
                  style={{ background: from }}
                />
                <span
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 10px 24px -8px ${from}` }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="relative mt-5 text-lg font-medium text-white">{title}</h3>
                <p className="relative mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                <ul className="relative mt-5 flex flex-wrap gap-2 pt-1">
                  {formats.map((f) => (
                    <li
                      key={f}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-slate-300"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-8 pb-28">
          <SectionHeading
            eyebrow="Privacy by design"
            title="Your data never has to leave your machine"
            body="PowerLens runs its AI on a local model through Ollama, so questions and datasets are processed on your own hardware instead of being sent to a third-party AI service."
          />

          <div className="mt-14 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
            <div className="flex flex-col items-stretch gap-8 lg:flex-row lg:items-center lg:gap-6">
              <div className="relative flex-1 rounded-2xl border border-dashed border-violet-300/40 bg-violet-500/[0.06] p-5 pt-10 sm:p-7 sm:pt-10">
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1.5 rounded-full border border-violet-300/40 bg-[#13113a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                  <Lock className="h-3 w-3" /> Your machine
                </span>
                <div className="flex flex-col items-stretch sm:flex-row sm:items-center">
                  <FlowNode icon={Database} title="Your data" sub="Files and databases" tint="#3b82f6" />
                  <FlowConnector />
                  <FlowNode icon={Cpu} title="Local model" sub="Ollama, on-device" tint="#a855f7" />
                  <FlowConnector />
                  <FlowNode icon={Sparkles} title="Your answer" sub="Charts and forecasts" tint="#ec4899" />
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 lg:justify-start">
                <div aria-hidden className="relative hidden h-px w-14 border-t border-dashed border-rose-300/40 lg:block">
                  <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-300/40">
                    <X className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 opacity-80">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] text-slate-500">
                    <CloudOff className="h-5 w-5" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-slate-300 line-through decoration-rose-300/50">Third-party AI</p>
                    <p className="mt-1 text-xs text-rose-300/90">No data sent</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {PRIVACY_POINTS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-violet-300/80">0{i + 1}</span>
                  <Icon className="h-5 w-5 text-violet-300" />
                </div>
                <h3 className="mt-4 font-medium text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <CtaSection />

      <div className="relative z-10 mx-auto max-w-[1180px] px-6">
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-10 sm:flex-row">
          <Logo className="text-slate-200" />
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} PowerLens. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}
