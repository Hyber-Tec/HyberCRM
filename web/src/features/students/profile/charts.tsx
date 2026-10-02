import { useEffect, useRef, useState } from 'react'
import { type DateKey, formatDateKey } from '@shared/time'

const BLUE = '#2a78d6'

/** The element's width, kept up to date (charts draw at their real size, so text stays crisp). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/**
 * Practice accuracy by week (questions answered correctly out of those
 * attempted, as tutors record them in session logs), on a 50–100% axis that
 * widens when a week falls below 50%.
 */
export function WeeklyAccuracyChart({ weeks }: { weeks: { start: DateKey; accuracy: number; attempted: number }[] }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 190
  const top = 12
  const bottom = 26
  const left = 34
  const right = 46
  const lowest = Math.min(...weeks.map((w) => w.accuracy))
  const min = lowest >= 50 ? 50 : Math.max(0, Math.floor(lowest / 25) * 25)
  const ticks = min === 50 ? [50, 75, 100] : [min, Math.round((min + 100) / 2), 100]
  const plotW = Math.max(0, width - left - right)
  const plotH = H - top - bottom
  const x = (i: number) => left + (weeks.length > 1 ? (i / (weeks.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => top + (1 - (v - min) / (100 - min)) * plotH
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.accuracy).toFixed(1)}`).join(' ')
  const area = weeks.length ? `${line} L${x(weeks.length - 1).toFixed(1)},${(top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(top + plotH).toFixed(1)} Z` : ''
  // About one date label per 80px.
  const every = Math.max(1, Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 80))))
  const last = weeks.length - 1
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={H} role="img" aria-label="Practice accuracy by week" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === min ? undefined : '3 4'} />
              <text x={left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <path d={area} fill={BLUE} fillOpacity={0.1} />
          <path d={line} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {weeks.map((w, i) =>
            i % every === 0 || i === last ? (
              <text key={w.start} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-muted-foreground text-[11px]">
                {formatDateKey(w.start, 'monthDay')}
              </text>
            ) : null,
          )}
          {weeks.length ? (
            <g>
              <circle cx={x(last)} cy={y(weeks[last].accuracy)} r={4} fill={BLUE} className="stroke-card" strokeWidth={2} />
              <text x={x(last) + 8} y={y(weeks[last].accuracy) + 4} className="fill-foreground text-[11px] font-semibold tabular-nums">
                {weeks[last].accuracy}%
              </text>
            </g>
          ) : null}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} className="stroke-muted-foreground/40" />
              <circle cx={x(hover)} cy={y(weeks[hover].accuracy)} r={4} fill={BLUE} className="stroke-card" strokeWidth={2} />
            </g>
          ) : null}
          {/* Hover targets, one per week. */}
          {weeks.map((w, i) => {
            const half = weeks.length > 1 ? plotW / (weeks.length - 1) / 2 : plotW / 2
            return <rect key={`hit-${w.start}`} x={x(i) - half} y={top} width={half * 2} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
          })}
        </svg>
      ) : (
        <div style={{ height: H }} />
      )}
      {hover !== null && width > 0 ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
          style={{ left: x(hover), top: y(weeks[hover].accuracy) - 10 }}
        >
          <div className="font-semibold tabular-nums">{weeks[hover].accuracy}% correct</div>
          <div className="text-muted-foreground">
            Week of {formatDateKey(weeks[hover].start, 'monthDay')} · {weeks[hover].attempted} questions
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** A progress ring with a label in the middle. */
export function Ring({ value, max, size = 52, thick = 6, label, color = BLUE }: { value: number; max: number; size?: number; thick?: number; label: string; color?: string }) {
  const r = (size - thick) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-blue-100 dark:stroke-blue-950" strokeWidth={thick} />
        {pct > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" strokeDasharray={`${(pct * c).toFixed(1)} ${c.toFixed(1)}`} />
        ) : null}
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">{label}</span>
    </span>
  )
}
