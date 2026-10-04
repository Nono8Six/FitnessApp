import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Block, Sample } from '../lib/types'
import { clock, dec1 } from '../lib/format'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/* ---------- Ring ---------- */

export function Ring({ value, size = 64, stroke = 10, color = 'var(--color-accent)', children }: {
  value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} className="transition-[stroke-dasharray] duration-700 ease-ios" />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}

/* ---------- Programme profile ---------- */

export function ProgrammeChart({ blocks, height = 112, compact = false, className }: {
  blocks: Block[]; height?: number; compact?: boolean; className?: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const helpId = useId()
  useEffect(() => { setHovered(null); setPinned(null) }, [blocks])
  const selected = hovered ?? pinned
  const active = selected === null ? undefined : blocks[selected]
  const total = blocks.at(-1)?.end ?? 0
  const plotWidth = Math.max(1, w - 28)
  const speedTop = 26, speedBottom = speedTop + height
  const inclineTop = speedBottom + 38, inclineHeight = compact ? 32 : 48
  const inclineBottom = inclineTop + inclineHeight
  const svgHeight = inclineBottom + 26
  // Partir de zéro préserve les proportions ; arrondir au palier de 2 supérieur
  // rend les séances lentes lisibles sans tronquer l'axe ni changer au survol.
  const speedMax = Math.max(2, Math.ceil(Math.max(0, ...blocks.map(b => b.speed)) / 2) * 2)
  const x = (seconds: number) => seconds / (total || 1) * plotWidth
  const speedY = (speed: number) => speedBottom - speed / speedMax * height
  const inclineY = (incline: number) => inclineBottom - incline / 10 * inclineHeight
  const inclinePath = blocks.map((b, i) => `${i ? 'L' : 'M'}${x(b.start)},${inclineY(b.incline)}H${x(b.end)}`).join(' ')
  const gap = blocks.length > 24 ? 0.5 : 2
  const clear = () => { setHovered(null); setPinned(null) }
  const select = (index: number) => { setHovered(null); setPinned(Math.max(0, Math.min(blocks.length - 1, index))) }
  const pointIndex = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const seconds = Math.max(0, Math.min(total, (event.clientX - bounds.left) * w / bounds.width / plotWidth * total))
    return Math.max(0, blocks.findIndex((b, i) => seconds < b.end || i === blocks.length - 1))
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape') clear()
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') select((selected ?? -1) + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') select((selected ?? blocks.length) - 1)
    else if (event.key === 'Home') select(0)
    else if (event.key === 'End') select(blocks.length - 1)
    else return
    event.preventDefault()
  }
  const range = (field: 'speed' | 'incline') => {
    const low = Math.min(...blocks.map(b => b[field])), high = Math.max(...blocks.map(b => b[field]))
    return low === high ? dec1(low) : `${dec1(low)}–${dec1(high)}`
  }
  return <div ref={ref} className={className}>
    {!blocks.length || total <= 0 ? <p className="text-footnote text-label-2">Aucun segment</p> : <>
      <div className="mb-2 flex min-h-[60px] items-center gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-subhead font-semibold">{active ? `${active.index + 1} · ${active.label}` : 'Profil de la séance'}</p>
          <p id={helpId} className="num mt-1 text-footnote text-label-2">{active
            ? `${clock(active.start)}–${clock(active.end)} · durée ${clock(active.sec)}`
            : 'Survolez ou touchez un segment'}</p>
        </div>
        {active && <button type="button" aria-label="Effacer la sélection du segment" onClick={clear}
          className="pressable grid size-11 shrink-0 place-items-center rounded-full text-label-2"><X size={17} /></button>}
      </div>
      {w > 0 && <svg width={w} height={svgHeight} role="slider" tabIndex={0}
        aria-label="Explorer les segments de la séance" aria-describedby={helpId}
        aria-valuemin={1} aria-valuemax={blocks.length} aria-valuenow={(selected ?? 0) + 1}
        aria-valuetext={active ? `Segment ${active.index + 1}, ${active.label}, de ${clock(active.start)} à ${clock(active.end)}, durée ${clock(active.sec)}, vitesse ${dec1(active.speed)} km/h, inclinaison ${dec1(active.incline)} %` : `${blocks.length} segments. Utilisez les flèches pour les explorer.`}
        className="touch-pan-y rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        onKeyDown={onKey} onBlur={() => setHovered(null)}
        onPointerDown={event => { select(pointIndex(event)); if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => {
          if (event.pointerType === 'mouse') setHovered(pointIndex(event))
          else if (event.buttons === 1) select(pointIndex(event))
        }}
        onPointerLeave={() => setHovered(null)} onPointerCancel={() => setHovered(null)}>
        <text x={0} y={14} fill="var(--color-accent)" fontSize={13} fontWeight={600}>Vitesse</text>
        <text x={plotWidth} y={14} textAnchor="end" fill="var(--color-accent)" fontSize={13} className="num">{active ? dec1(active.speed) : range('speed')} km/h</text>
        <text x={0} y={inclineTop - 12} fill="var(--color-incline)" fontSize={13} fontWeight={600}>Inclinaison</text>
        <text x={plotWidth} y={inclineTop - 12} textAnchor="end" fill="var(--color-incline)" fontSize={13} className="num">{active ? dec1(active.incline) : range('incline')} %</text>
        {[0, speedMax / 2, speedMax].map(value => <g key={`speed-${value}`}>
          <line x1={0} x2={plotWidth} y1={speedY(value)} y2={speedY(value)} stroke="var(--color-sep)" strokeWidth={0.5} />
          <text x={plotWidth + 6} y={speedY(value) + 4} fill="var(--color-label-2)" fontSize={10}>{value}</text>
        </g>)}
        {[0, 5, 10].map(value => <g key={`incline-${value}`}>
          <line x1={0} x2={plotWidth} y1={inclineY(value)} y2={inclineY(value)} stroke="var(--color-sep)" strokeWidth={0.5} />
          <text x={plotWidth + 6} y={inclineY(value) + 4} fill="var(--color-label-2)" fontSize={10}>{value}</text>
        </g>)}
        {active && <rect x={x(active.start)} y={speedTop} width={Math.max(1, x(active.sec))} height={inclineBottom - speedTop}
          fill="var(--color-label)" opacity={0.07} />}
        {blocks.map(b => <rect key={b.index} x={x(b.start)} y={speedY(b.speed)}
          width={Math.max(0.5, x(b.sec) - Math.min(gap, x(b.sec) / 3))} height={speedBottom - speedY(b.speed)}
          rx={Math.min(3, x(b.sec) / 5)} fill={b.kind === 'run' || b.kind === 'steady' ? 'var(--color-accent)' : '#636366'}
          opacity={active && active.index !== b.index ? 0.45 : 1} />)}
        <path d={`${inclinePath}L${plotWidth},${inclineBottom}H0Z`} fill="var(--color-incline)" opacity={0.12} />
        <path d={inclinePath} fill="none" stroke="var(--color-incline)" strokeWidth={2} strokeLinejoin="round" />
        {active && <>
          <line x1={x(active.start)} x2={x(active.start)} y1={speedTop} y2={inclineBottom} stroke="var(--color-label-2)" strokeDasharray="3 3" />
          <line x1={x(active.end)} x2={x(active.end)} y1={speedTop} y2={inclineBottom} stroke="var(--color-label-2)" strokeDasharray="3 3" />
          <path d={`M${x(active.start)},${inclineY(active.incline)}H${x(active.end)}`} stroke="var(--color-incline)" strokeWidth={4} />
        </>}
        {[0, total / 2, total].map((seconds, i) => <text key={i} x={x(seconds)} y={svgHeight - 4}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize={11} fill="var(--color-label-2)" className="num">{clock(seconds)}</text>)}
      </svg>}
      <div className="mt-1 flex items-center justify-between gap-2 text-footnote text-label-2">
        <span className="num">{active ? `Segment ${active.index + 1} sur ${blocks.length}` : `${blocks.length} segments`}</span>
        <div className="flex">
          <button type="button" aria-label="Segment précédent" disabled={selected === 0} onClick={() => select((selected ?? blocks.length) - 1)}
            className="pressable grid size-11 place-items-center rounded-[8px] hover:bg-fill-3 disabled:text-label-3"><ChevronLeft size={20} /></button>
          <button type="button" aria-label="Segment suivant" disabled={selected === blocks.length - 1} onClick={() => select((selected ?? -1) + 1)}
            className="pressable grid size-11 place-items-center rounded-[8px] hover:bg-fill-3 disabled:text-label-3"><ChevronRight size={20} /></button>
        </div>
      </div>
    </>}
  </div>
}

/* ---------- Week bars ---------- */

export function WeekBars({ days, goalMin = 30, height = 92 }: {
  days: { letter: string; min: number; future: boolean; today: boolean }[]; goalMin?: number; height?: number
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const max = Math.max(goalMin * 1.5, ...days.map((d) => d.min))
  const plot = height - 20
  const col = w / days.length
  const bw = Math.min(18, col * 0.46)
  return (
    <div ref={ref} style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Minutes par jour : ${days.map((d) => `${d.letter} ${d.min}`).join(', ')}`}>
          {days.map((d, i) => {
            const cx = col * i + col / 2
            const h = d.min ? Math.max(6, (d.min / max) * plot) : 0
            return (
              <g key={i}>
                <rect x={cx - bw / 2} y={plot - (d.min ? h : 4)} width={bw} height={d.min ? h : 4} rx={d.min ? bw / 2.6 : 2}
                  fill={d.min ? 'var(--color-accent)' : 'rgb(120 120 128 / .32)'} opacity={d.future ? 0.5 : 1} />
                <text x={cx} y={height - 2} textAnchor="middle" fontSize={11} fontWeight={d.today ? 700 : 500}
                  fill={d.today ? 'var(--color-label)' : 'var(--color-label-2)'}>{d.letter}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/* ---------- Time series ---------- */

export interface Series {
  key: string
  data: Sample[]
  value: (s: Sample) => number | null
  color: string
  width?: number
  dash?: string
  step?: boolean
  area?: boolean
  opacity?: number
}

export interface Marker { t: number; label: string; sec?: number }

type Pt = [number, number]

function segments(data: Sample[], value: (s: Sample) => number | null, x: (t: number) => number, y: (v: number) => number, step = false, maxGap = 12) {
  const segs: Pt[][] = []
  let cur: Pt[] = []
  let prev: Sample | null = null
  for (const s of data) {
    const v = value(s)
    if (v === null || (prev && s.t - prev.t > maxGap)) {
      if (cur.length) segs.push(cur)
      cur = []
      prev = v === null ? null : prev
      if (v === null) continue
    }
    const X = x(s.t), Y = y(v)
    if (step && cur.length) cur.push([X, cur[cur.length - 1][1]])
    cur.push([X, Y])
    prev = s
  }
  if (cur.length) segs.push(cur)
  return segs
}

const line = (segs: Pt[][]) => segs.map((seg) => 'M' + seg.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L')).join('')
const area = (segs: Pt[][], base: number) =>
  segs.map((seg) => `M${seg[0][0].toFixed(1)},${base}L` + seg.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L') + `L${seg[seg.length - 1][0].toFixed(1)},${base}Z`).join('')

function niceTicks(lo: number, hi: number, count = 3) {
  const span = hi - lo
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => span / m <= count + 0.5) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4))
  return out
}

export function TimeChart({
  series, x0, x1, y0, y1, height = 200, unit, markers = [], gaps = [], cursor, onCursor, label, yFormat = (v) => String(v).replace('.', ','),
  live,
}: {
  series: Series[]; x0: number; x1: number; y0: number; y1: number; height?: number; unit: string
  markers?: Marker[]; gaps?: [number, number][]; cursor?: number | null; onCursor?: (t: number | null) => void; label: string
  yFormat?: (v: number) => string; live?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const padR = 34, padB = 22, padT = 8
  const pw = Math.max(1, w - padR)
  const ph = height - padB - padT
  const x = useCallback((t: number) => ((t - x0) / (x1 - x0 || 1)) * pw, [x0, x1, pw])
  const y = useCallback((v: number) => padT + ph - ((v - y0) / (y1 - y0 || 1)) * ph, [y0, y1, ph])
  const yTicks = useMemo(() => niceTicks(y0, y1, 3), [y0, y1])
  const xTicks = useMemo(() => {
    const span = x1 - x0
    const step = [15, 30, 60, 120, 300, 600, 900].find((s) => span / s <= (w < 480 ? 4 : 6)) ?? 1800
    const out: number[] = []
    for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) out.push(t)
    return out
  }, [x0, x1, w])
  const gradId = useId()

  const tFromEvent = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    const px = Math.max(0, Math.min(pw, e.clientX - r.left))
    return x0 + (px / pw) * (x1 - x0)
  }
  const dragging = useRef(false)
  const onDown = (e: PointerEvent) => {
    if (!onCursor) return
    dragging.current = true
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    onCursor(tFromEvent(e))
  }
  const onMove = (e: PointerEvent) => {
    if (!onCursor) return
    if (dragging.current || e.pointerType === 'mouse') onCursor(tFromEvent(e))
  }
  const onUp = (e: PointerEvent) => {
    dragging.current = false
    if (e.pointerType !== 'mouse') onCursor?.(null)
  }
  const onKey = (e: KeyboardEvent) => {
    if (!onCursor) return
    const stepS = (x1 - x0) / 60
    const cur = cursor ?? x0
    if (e.key === 'ArrowRight') { onCursor(Math.min(x1, cur + stepS)); e.preventDefault() }
    if (e.key === 'ArrowLeft') { onCursor(Math.max(x0, cur - stepS)); e.preventDefault() }
    if (e.key === 'Escape') onCursor(null)
  }

  const fmtT = (t: number) => (x1 - x0 <= 600 ? clock(t) : `${Math.round(t / 60)}`)

  return (
    <div ref={ref} style={{ height }} className="select-none">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${label} (${unit})`} tabIndex={onCursor ? 0 : undefined} onKeyDown={onKey}
          className="touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-accent">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
            <clipPath id={`${gradId}-clip`}><rect x={0} y={0} width={pw} height={height} /></clipPath>
          </defs>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={pw} y1={y(v)} y2={y(v)} stroke="var(--color-sep)" strokeWidth={0.5} />
              <text x={pw + 6} y={y(v) + 4} fontSize={11} fill="var(--color-label-2)" className="num">{yFormat(v)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={padT} y2={padT + ph} stroke="var(--color-sep)" strokeWidth={0.5} strokeDasharray="1 3" />
              <text x={x(t)} y={height - 5} fontSize={11} fill="var(--color-label-2)" textAnchor={t === x0 ? 'start' : 'middle'} className="num">{fmtT(t)}</text>
            </g>
          ))}
          <g clipPath={`url(#${gradId}-clip)`}>
            {gaps.map(([a, b]) => (
              <rect key={a} x={x(a)} y={padT} width={Math.max(2, x(b) - x(a))} height={ph} fill="rgb(255 159 10 / .2)" />
            ))}
            {markers.map((m) => (
              <g key={m.t}>
                <line x1={x(m.t)} x2={x(m.t)} y1={padT} y2={padT + ph} stroke="var(--color-yellow)" strokeWidth={1} strokeDasharray="3 3" />
                <rect x={x(m.t) - 4} y={padT} width={8} height={8} rx={2} fill="var(--color-yellow)" />
              </g>
            ))}
            {series.map((s) => {
              const segs = segments(s.data.filter((p) => p.t >= x0 - 10 && p.t <= x1 + 10), s.value, x, y, s.step)
              return (
                <g key={s.key} opacity={s.opacity ?? 1}>
                  {s.area && <path d={area(segs, padT + ph)} fill={`url(#${gradId})`} />}
                  <path d={line(segs)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              )
            })}
            {live && (() => {
              const main = series[0]
              const lastS = [...main.data].reverse().find((p) => main.value(p) !== null)
              if (!lastS) return null
              return (
                <g>
                  <circle cx={x(lastS.t)} cy={y(main.value(lastS)!)} r={9} fill={main.color} opacity={0.22} className="animate-pulse-dot" />
                  <circle cx={x(lastS.t)} cy={y(main.value(lastS)!)} r={4} fill={main.color} stroke="#000" strokeWidth={1.5} />
                </g>
              )
            })()}
          </g>
          {cursor != null && cursor >= x0 && cursor <= x1 && (
            <g pointerEvents="none">
              <line x1={x(cursor)} x2={x(cursor)} y1={padT - 8} y2={padT + ph} stroke="var(--color-label-2)" strokeWidth={1} />
              {series.filter((s) => !s.dash).map((s) => {
                const p = nearest(s.data, cursor)
                const v = p && s.value(p)
                return v != null && Math.abs(p!.t - cursor) < 12 ? (
                  <circle key={s.key} cx={x(p!.t)} cy={y(v)} r={4.5} fill={s.color} stroke="#000" strokeWidth={2} />
                ) : null
              })}
            </g>
          )}
          {onCursor && (
            <rect x={0} y={0} width={pw} height={height} fill="transparent"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onPointerLeave={(e) => e.pointerType === 'mouse' && onCursor(null)} style={{ cursor: 'crosshair' }} />
          )}
        </svg>
      )}
    </div>
  )
}

export function nearest(data: Sample[], t: number): Sample | undefined {
  let lo = 0, hi = data.length - 1
  if (hi < 0) return undefined
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (data[mid].t < t) lo = mid
    else hi = mid
  }
  return Math.abs(data[lo].t - t) <= Math.abs(data[hi].t - t) ? data[lo] : data[hi]
}

/** Live-friendly: re-render on an interval without a store. */
export function useNow(ms = 1000) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return n
}
