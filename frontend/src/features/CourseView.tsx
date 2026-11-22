import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowLeftRight, Flag, Gauge, Mountain } from 'lucide-react'
import { nearest, TimeChart, useWidth, type Series } from '../components/charts'
import { clock, dec1, pace } from '../lib/format'
import type { LiveSample, Session } from '../lib/execution'
import type { Block } from '../lib/types'
import { courseTimeline } from '../lib/courseTimeline'

/** Le bloc, la mesure et le temps restant restent à la même place dans les deux vues. */
export function CourseReadout({ block, index, count, active, available, speed, incline, showPace, onToggle }: {
  block: Block; index: number; count: number; active: number; available: boolean
  speed: number | null; incline: number | null; showPace: boolean; onToggle?: () => void
}) {
  const elapsed = Math.max(0, Math.min(block.sec, active - block.start))
  const remaining = available ? clock(Math.ceil(block.sec - elapsed)) : '—'
  const value = speed === null || (showPace && speed <= 0) ? '—' : showPace ? pace(speed) : dec1(speed)
  const unit = showPace ? 'min/km' : 'km/h'
  const measure = <>
    <span className="course-main-value" data-long={value.length > 5 || undefined} data-missing={value === '—' || undefined}>{value}</span>
    <span className="course-unit">{unit}{onToggle && <ArrowLeftRight size={14} aria-hidden />}</span>
  </>
  return <section className="course-readout" aria-label="Bloc en cours">
    <div className="course-stage">
      <span className="course-stage-number num" aria-label={`Bloc ${index + 1} sur ${count}`}>{index + 1}<span>/{count}</span></span>
      <h2>{block.label}</h2>
    </div>
    <div className="course-progress" role="progressbar" aria-label="Progression du bloc" aria-valuemin={0} aria-valuemax={block.sec} aria-valuenow={Math.round(elapsed)}>
      <span style={{ width: `${elapsed / block.sec * 100}%` }} />
    </div>
    <dl className="course-numbers num">
      <div><dt>{showPace ? 'Allure' : 'Vitesse'}</dt>
        <dd>{onToggle ? <button type="button" className="course-unit-switch" onClick={onToggle} aria-label={showPace ? 'Afficher la vitesse en km/h' : 'Afficher l’allure par kilomètre'}>{measure}</button> : measure}</dd>
      </div>
      <div><dt>Temps restant</dt>
        <dd className="course-timer" data-long={remaining.length > 5 || undefined}>{remaining}</dd>
      </div>
    </dl>
    <p className="course-sensors num">
      {showPace && <span><Gauge size={16} aria-hidden /><span className="sr-only">Vitesse </span>{speed === null ? '—' : dec1(speed)} km/h</span>}
      <span><Mountain size={16} aria-hidden /><span className="sr-only">Pente </span>{incline === null ? '—' : dec1(incline)} %</span>
    </p>
    {onToggle && <p className="course-target num">Cible · {dec1(block.speed)} km/h · {dec1(block.incline)} %</p>}
  </section>
}

export function CourseChart({ session, samples, blocks, available, hasMeasurement }: {
  session: Session; samples: LiveSample[]; blocks: Block[]; available: boolean; hasMeasurement: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
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
  const selectedSpeed = future ? planned.speed : observed?.speed
  const selectedIncline = future ? planned.incline : observed?.incline
  const reading = cursor === null ? null : `${future ? 'Consigne' : cursor > (next?.end ?? block.end) ? 'Fin' : observed ? 'Mesuré' : 'Absent'} · ${clock(observed?.t ?? cursor)}`
  const series: Series[] = [
    { key: 'measured-speed', data: measured, value: p => p.speed, color: 'var(--color-speed)', width: 3, area: true, maxGap: 2 },
    { key: 'measured-incline', data: measured, value: p => p.incline, color: 'var(--color-incline)', width: 2, step: true, maxGap: 2, axis: 'secondary' },
    { key: 'planned-speed', data: forecast, value: p => p.target, color: 'var(--color-speed)', shape: 'target', step: true, joinSteps: false, showPoint: false, maxGap: Infinity },
    { key: 'planned-incline', data: forecast, value: p => p.target_incline ?? null, color: 'var(--color-incline)', shape: 'target', step: true, joinSteps: false, showPoint: false, maxGap: Infinity, axis: 'secondary' },
  ]
  const moving = ['running', 'transitioning', 'adjusting'].includes(session.phase)
  const maximum = Math.max(16, Math.ceil(Math.max(block.speed, next?.speed ?? 0, ...measured.map(p => p.speed ?? 0)) / 4) * 4)
  const inclineMaximum = Math.max(2, Math.ceil(Math.max(block.incline, next?.incline ?? 0, ...measured.map(p => p.incline ?? 0)) / 2) * 2)
  const markers = next ? [{ t: block.end, label: `Bloc suivant · ${next.label}` }] : []
  return <div ref={ref} className="course-chart" aria-label="Vitesse et pente mesurées et prévues">
    <div className="course-chart-heading">
      {cursor === null ? <div className="course-legend">
        <span><i />Vitesse <small>km/h</small></span>
        <span><i />Pente <small>%</small></span>
      </div> : <div className="course-chart-reading num" aria-live="polite">
        <span>{reading}</span>
        <strong>{selectedSpeed != null ? dec1(selectedSpeed) : '--'} <small>km/h</small></strong>
        <strong>{selectedIncline != null ? dec1(selectedIncline) : '--'} <small>%</small></strong>
        <button type="button" onClick={() => setSelected(null)} className="course-chart-live" aria-label="Retour au direct">Direct</button>
      </div>}
    </div>
    <TimeChart series={series}
      x0={x0} x1={x1} y0={0} y1={maximum} height={width >= 600 ? 200 : 132} unit="km/h"
      secondary={{ y0: 0, y1: inclineMaximum, unit: '%', color: 'var(--color-incline)' }}
      label="Vitesse et inclinaison mesurées et prévues, bloc actuel et suivant"
      present={active} cursor={cursor} onCursor={setSelected} gaps={gaps}
      cursorDescription={reading ? `${reading}, ${selectedSpeed != null ? `${dec1(selectedSpeed)} km/h` : 'vitesse absente'}, ${selectedIncline != null ? `${dec1(selectedIncline)} %` : 'pente absente'}` : undefined}
      live={available && hasMeasurement && moving && cursor === null}
      markers={markers} />
    {!measured.some(p => p.speed !== null || p.incline != null) && <p className="course-chart-empty" role="status">{available ? 'En attente des premières mesures' : 'Mesures actuelles indisponibles'}</p>}
  </div>
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
