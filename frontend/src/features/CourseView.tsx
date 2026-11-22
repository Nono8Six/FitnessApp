import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Flag, Gauge, Mountain } from 'lucide-react'
import { nearest, TimeChart, usePlotHeight, type Series } from '../components/charts'
import { clock, dec1, pace } from '../lib/format'
import type { LiveSample, Session } from '../lib/execution'
import type { Block } from '../lib/types'
import { courseTimeline } from '../lib/courseTimeline'

export function CourseReadout({ block, index, count, elapsed, children }: {
  block: Block; index: number; count: number; elapsed: number; children: ReactNode
}) {
  return <section className="course-readout" aria-label="Bloc en cours">
    <div className="course-stage">
      <span className="course-stage-number num" aria-label={`Bloc ${index + 1} sur ${count}`}>{index + 1}<span>/{count}</span></span>
      <h2>{block.label}</h2>
    </div>
    <div className="course-progress" role="progressbar" aria-label="Progression du bloc" aria-valuemin={0} aria-valuemax={block.sec} aria-valuenow={Math.round(elapsed)}>
      <span style={{ width: `${elapsed / block.sec * 100}%` }} />
    </div>
    <dl className="course-numbers num">{children}</dl>
  </section>
}

export function BlockReadings({ speed, remaining }: { speed: number | null; remaining: string }) {
  const value = speed !== null && speed > 0 ? pace(speed) : '—'
  return <>
    <div><dt>Allure</dt>
      <dd><span className="course-main-value" data-long={value.length > 5 || undefined} data-missing={value === '—' || undefined}>{value}</span>
        <span className="course-unit">min/km</span></dd>
    </div>
    <div><dt>Temps restant</dt>
      <dd className="course-timer" data-long={remaining.length > 5 || undefined}>{remaining}</dd>
    </div>
  </>
}

export function CourseChart({ session, samples, blocks, available, speed, incline }: {
  session: Session; samples: LiveSample[]; blocks: Block[]; available: boolean; speed: number | null; incline: number | null
}) {
  const [plot, height] = usePlotHeight()
  const block = blocks[session.block_index], next = blocks[session.block_index + 1]
  const active = session.active_s
  const { x0, x1, measured, forecast, gaps } = useMemo(() => courseTimeline(samples, blocks, session.block_index, active), [samples, blocks, session.block_index, active])
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => { setSelected(null) }, [session.id])
  const cursor = selected !== null && selected >= x0 && selected <= x1 ? selected : null
  const point = cursor !== null && cursor <= active ? nearest(measured, cursor) : null
  const observed = point && cursor !== null && Math.abs(point.t - cursor) <= 2 ? point : null
  const planned = cursor !== null && next && cursor >= block.end ? next : block
  const future = cursor !== null && cursor > active && cursor <= (next?.end ?? block.end)
  const readSpeed = future ? planned.speed : observed?.speed
  const readIncline = future ? planned.incline : observed?.incline
  const reading = cursor === null ? null : `${future ? 'Cible' : readSpeed != null || readIncline != null ? 'Mesure' : 'Sans mesure'} · ${clock(cursor)}`
  const series: Series[] = [
    { key: 'measured-speed', data: measured, value: p => p.speed, color: 'var(--color-speed)', width: 4, area: true, maxGap: 2, showPoint: speed !== null },
    { key: 'measured-incline', data: measured, value: p => p.incline, color: 'var(--color-incline)', width: 2.5, step: true, maxGap: 2, axis: 'secondary', showPoint: incline !== null },
    { key: 'planned-speed', data: forecast, value: p => p.target, color: 'var(--color-speed)', opacity: .75, shape: 'target', step: true, joinSteps: false, showPoint: false, maxGap: Infinity },
    { key: 'planned-incline', data: forecast, value: p => p.target_incline ?? null, color: 'var(--color-incline)', opacity: .85, shape: 'target', step: true, joinSteps: false, showPoint: false, maxGap: Infinity, axis: 'secondary' },
  ]
  const speeds = [...blocks.map(b => b.speed), ...measured.flatMap(p => p.speed === null ? [] : [p.speed])]
  const minSpeed = Math.max(0, Math.floor((Math.min(...speeds) - 1) / 2) * 2)
  const maxSpeed = Math.max(minSpeed + 4, Math.ceil((Math.max(...speeds) + 1) / 2) * 2)
  const maxIncline = Math.max(2, Math.ceil(Math.max(...blocks.map(b => b.incline), ...measured.map(p => p.incline ?? 0)) / 2) * 2)
  const moving = ['running', 'transitioning', 'adjusting'].includes(session.phase)
  const markers = next ? [{ t: block.end, label: next.label }] : []
  const hasHistory = measured.some(p => p.speed !== null || p.incline !== null)
  return <section className="course-chart" aria-label="Vitesse et pente">
    <dl className="course-legend">
      <div><dt><Gauge size={15} aria-hidden />Vitesse</dt><dd className="num">{speed === null ? '—' : dec1(speed)} <small>km/h</small></dd></div>
      <div><dt>Pente<Mountain size={15} aria-hidden /></dt><dd className="num">{incline === null ? '—' : dec1(incline)} <small>%</small></dd></div>
    </dl>
    {reading && <div className="course-reading num">
      <span>{reading} · {readSpeed == null ? '—' : dec1(readSpeed)} km/h · {readIncline == null ? '—' : dec1(readIncline)} %</span>
      <button type="button" onClick={() => setSelected(null)} aria-label="Revenir au direct">Direct ↩</button>
    </div>}
    <div ref={plot} className="course-plot">
      {height > 38 && <TimeChart series={series} x0={x0} x1={x1} y0={minSpeed} y1={maxSpeed} height={height} unit="km/h"
        secondary={{ y0: 0, y1: maxIncline, unit: '%', color: 'var(--color-incline)' }}
        label="Vitesse et pente mesurées et prévues" present={active} cursor={cursor} onCursor={setSelected} gaps={gaps}
        cursorDescription={reading ? `${reading}, ${readSpeed == null ? 'vitesse absente' : dec1(readSpeed) + ' km/h'}, ${readIncline == null ? 'pente absente' : dec1(readIncline) + ' %'}` : undefined}
        live={available && moving && cursor === null} markers={markers} />}
      {!hasHistory && <span className="course-chart-empty" role="status">{available ? 'En attente de mesures' : 'Mesures indisponibles'}</span>}
    </div>
  </section>
}

export function CourseData({ speed, incline, block, children }: {
  speed: number | null; incline: number | null; block: Block; children: ReactNode
}) {
  return <section className="course-data" aria-label="Mesures du bloc">
    <dl className="course-data-grid num">
      {children}
      <div><dt>Vitesse</dt><dd className="text-speed">{speed === null ? '—' : dec1(speed)}<small>km/h</small></dd></div>
      <div><dt>Pente</dt><dd className="text-incline">{incline === null ? '—' : dec1(incline)}<small>%</small></dd></div>
    </dl>
    <p className="course-data-targets"><span>Cibles du bloc</span><span className="num">{dec1(block.speed)} km/h · {dec1(block.incline)} %</span></p>
  </section>
}

export function NextBlock({ next }: { next?: Block }) {
  return <section className="course-next" aria-label={next ? 'Bloc suivant' : 'Fin du programme'}>
    {next ? <ArrowRight size={20} aria-hidden /> : <Flag size={19} aria-hidden />}
    <div>
      <p className="course-next-label">{next ? 'À suivre' : 'Après ce bloc'}</p>
      <h3>{next?.label ?? 'Arrêt automatique'}</h3>
      {next && <p className="course-next-target num">{dec1(next.speed)} km/h · {dec1(next.incline)} %</p>}
    </div>
    {next && <span className="course-next-duration num" aria-label={`Durée du prochain bloc ${clock(next.sec)}`}>{clock(next.sec)}</span>}
  </section>
}
