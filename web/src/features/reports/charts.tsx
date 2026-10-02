import type { SessionPoint } from '@shared/reports/types'
import { type DateKey, diffDays, formatDateKey, parseDateKey } from '@shared/time'

/** Ink colors of the report paper (it stays light in dark mode, like printed paper). */
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', hairline: '#e1e0d9', paper: '#ffffff' }
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }

const day = (d: DateKey) => String(parseDateKey(d).day)

/** A tiny trend line for a KPI tile; it stretches to the tile's width. */
export function Sparkline({ values, color, height = 18 }: { values: (number | null)[]; color: string; height?: number }) {
  const v = values.filter((x): x is number => x !== null)
  if (v.length < 2) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(18 - ((x - min) / span) * 16).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" width="100%" height={height} aria-hidden className="block overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Practice accuracy per session on a fixed percent axis, with the first and last values labeled. */
export function AccuracyChart({ points, color }: { points: { dateKey: DateKey; accuracy: number }[]; color: string }) {
  const W = 420
  const H = 180
  const L = 34
  const R = 404
  const T = 14
  const B = 152
  const lowest = Math.min(...points.map((p) => p.accuracy))
  const floor = Math.max(0, Math.min(50, Math.floor((lowest - 10) / 10) * 10))
  const y = (v: number) => B - ((v - floor) / (100 - floor)) * (B - T)
  const x = (i: number) => (points.length === 1 ? (L + R) / 2 : L + (i / (points.length - 1)) * (R - L))
  const ticks: number[] = []
  for (let t = floor; t <= 100; t += floor <= 20 ? 20 : 10) ticks.push(t)
  const every = Math.ceil(points.length / 12)
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Practice accuracy went from ${first.accuracy}% to ${last.accuracy}%`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke={INK.hairline} strokeWidth="1" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK.muted}>
            {t}%
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % every === 0 || i === points.length - 1 ? (
          <text key={p.dateKey + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={INK.muted}>
            {day(p.dateKey)}
          </text>
        ) : null,
      )}
      <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.accuracy)} r="4" fill={color} stroke="#fff" strokeWidth="2">
          <title>{`${formatDateKey(p.dateKey, 'monthDay')}: ${p.accuracy}%`}</title>
        </circle>
      ))}
      <text x={x(0) + 8} y={y(first.accuracy) > B - 20 ? y(first.accuracy) - 10 : y(first.accuracy) + 16} fontSize="11" fontWeight="600" fill={INK.secondary}>
        {first.accuracy}%
      </text>
      {points.length > 1 ? (
        <text x={x(points.length - 1) - 8} y={y(last.accuracy) < T + 16 ? y(last.accuracy) + 18 : y(last.accuracy) - 10} textAnchor="end" fontSize="11" fontWeight="600" fill={INK.secondary}>
          {last.accuracy}%
        </text>
      ) : null}
    </svg>
  )
}

/** Hours by subject as a donut with the total in the middle. */
export function HoursDonut({ data, total }: { data: { subject: string; hours: number; color: string }[]; total: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const sum = data.reduce((n, d) => n + d.hours, 0) || 1
  const lens = data.map((d) => (d.hours / sum) * c)
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`${total} hours: ${data.map((d) => `${d.subject} ${d.hours}`).join(', ')}`} className="shrink-0">
      {data.map((d, i) => {
        const len = lens[i]
        const gap = data.length > 1 ? 2 : 0
        return (
          <circle
            key={d.subject}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="18"
            strokeDasharray={`${Math.max(0, len - gap).toFixed(2)} ${c.toFixed(2)}`}
            strokeDashoffset={(-offsets[i]).toFixed(2)}
            transform="rotate(-90 60 60)"
          >
            <title>{`${d.subject}: ${d.hours} h`}</title>
          </circle>
        )
      })}
      <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="600" fill={INK.primary}>
        {total}
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill={INK.muted}>
        hours
      </text>
    </svg>
  )
}

/** One mark per scheduled session: attended (subject color), missed (red ring), canceled (gray dash). */
export function SessionStrip({ sessions, colorOf }: { sessions: SessionPoint[]; colorOf: (subject: string) => string }) {
  const shown = sessions.filter((s) => s.status !== 'unlogged')
  return (
    <div className="flex flex-wrap justify-between gap-x-1.5 gap-y-3" role="img" aria-label={`${shown.filter((s) => s.status === 'attended').length} sessions attended`}>
      {shown.map((s, i) => (
        <div key={`${s.dateKey}-${i}`} className="flex min-w-6 flex-col items-center gap-1.5" title={`${formatDateKey(s.dateKey, 'monthDay')} · ${s.subject} · ${s.status}`}>
          {s.status === 'attended' ? (
            <span className="inline-block size-3.5 rounded-full" style={{ background: colorOf(s.subject) }} />
          ) : s.status === 'missed' ? (
            <span className="inline-flex size-3.5 items-center justify-center rounded-full border-2 text-[8px] leading-none font-bold" style={{ borderColor: STATUS_COLORS.critical, color: STATUS_COLORS.critical }}>
              ×
            </span>
          ) : (
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: INK.muted }} />
          )}
          <span className="text-[10px] tabular-nums" style={{ color: INK.muted }}>
            {day(s.dateKey)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Tutoring hours adding up over the period: a step up at each session. */
export function CumulativeHours({ sessions, from, to, color }: { sessions: SessionPoint[]; from: DateKey; to: DateKey; color: string }) {
  const W = 640
  const H = 150
  const L = 30
  const R = 600
  const T = 22
  const B = 126
  const span = Math.max(1, diffDays(from, to))
  const xOf = (d: DateKey) => L + (diffDays(from, d) / span) * (R - L)
  const attended = sessions.filter((s) => s.status === 'attended')
  const totals = attended.map((_, i) => attended.slice(0, i + 1).reduce((n, s) => n + s.hours, 0))
  const run = totals.length ? totals[totals.length - 1] : 0
  const pts = attended.map((s, i) => ({ x: xOf(s.dateKey), total: Math.round(totals[i] * 10) / 10, dateKey: s.dateKey }))
  const max = Math.max(1, run)
  const step = max <= 6 ? 2 : max <= 12 ? 4 : max <= 24 ? 6 : max <= 48 ? 12 : 24
  const top = Math.ceil(max / step) * step
  const y = (v: number) => B - (v / top) * (B - T)
  const ticks: number[] = []
  for (let t = 0; t <= top; t += step) ticks.push(t)
  let line = `M${L},${y(0)}`
  let prev = 0
  for (const p of pts) {
    line += ` L${p.x.toFixed(1)},${y(prev).toFixed(1)} L${p.x.toFixed(1)},${y(p.total).toFixed(1)}`
    prev = p.total
  }
  line += ` L${R},${y(prev).toFixed(1)}`
  // Date labels at least ~70 px apart, always with the first and last day.
  const candidates = [from, ...attended.map((s) => s.dateKey), to].filter((d, i, all) => all.indexOf(d) === i)
  const labels: DateKey[] = []
  for (const d of candidates) {
    const tooClose = labels.some((l) => Math.abs(xOf(l) - xOf(d)) < 70)
    if (!tooClose) labels.push(d)
    else if (d === to) {
      labels.pop()
      labels.push(d)
    }
  }
  const end = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${Math.round(run * 10) / 10} tutoring hours this period`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke={INK.hairline} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK.muted}>
            {t}
          </text>
        </g>
      ))}
      {labels.map((d) => (
        <text key={d} x={xOf(d)} y={H - 4} textAnchor={d === from ? 'start' : d === to ? 'end' : 'middle'} fontSize="10" fill={INK.muted}>
          {formatDateKey(d, 'monthDay')}
        </text>
      ))}
      {pts.length ? (
        <>
          <path d={`${line} L${R},${B} L${L},${B} Z`} fill={color} opacity=".10" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={y(p.total)} r="2.5" fill={color}>
              <title>{`${formatDateKey(p.dateKey, 'monthDay')}: ${p.total} h so far`}</title>
            </circle>
          ))}
          <text x={R} y={y(end.total) - 8} textAnchor="end" fontSize="11" fontWeight="600" fill={INK.secondary}>
            {end.total} h
          </text>
        </>
      ) : null}
    </svg>
  )
}

/** Each habit then → now on a 1–5 track (hollow: earlier, filled: later). */
export function Dumbbell({ rows, color }: { rows: { label: string; from: number; to: number }[]; color: string }) {
  const W = 300
  const rowH = 30
  const L = 92
  const R = 288
  const x = (v: number) => L + ((v - 1) / 4) * (R - L)
  const H = rows.length * rowH + 18
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={rows.map((r) => `${r.label} from ${r.from} to ${r.to}`).join(', ')}>
      {[1, 2, 3, 4, 5].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 16} stroke={INK.hairline} />
          <text x={x(t)} y={H - 3} textAnchor="middle" fontSize="9" fill={INK.muted}>
            {t}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cy = 4 + i * rowH + rowH / 2
        return (
          <g key={r.label}>
            <text x={0} y={cy + 4} fontSize="11" fill={INK.secondary}>
              {r.label}
            </text>
            <line x1={x(r.from)} x2={x(r.to)} y1={cy} y2={cy} stroke={color} strokeWidth="2" opacity=".45" />
            <circle cx={x(r.from)} cy={cy} r="5" fill="#fff" stroke={color} strokeWidth="2" />
            <circle cx={x(r.to)} cy={cy} r="5" fill={color} />
          </g>
        )
      })}
    </svg>
  )
}

/** Homework outcomes as one stacked bar in status colors. */
export function HomeworkBar({ completed, partial, notDone }: { completed: number; partial: number; notDone: number }) {
  const total = completed + partial + notDone || 1
  const parts = [
    { n: completed, color: STATUS_COLORS.good, label: 'Completed' },
    { n: partial, color: STATUS_COLORS.warning, label: 'Partly done' },
    { n: notDone, color: STATUS_COLORS.critical, label: 'Not done' },
  ].filter((p) => p.n > 0)
  return (
    <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
      {parts.map((p) => (
        <span key={p.label} className="h-full" style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.n}`} />
      ))}
    </div>
  )
}
