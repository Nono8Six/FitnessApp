import { useEffect, useMemo, useState } from 'react'
import { Gauge, Mountain } from 'lucide-react'
import { nearest, TimeChart, useWidth, type Series } from '../components/charts'
import { calories, clock, dec1, dec2, pace } from '../lib/format'
import type { LiveSample, Session } from '../lib/execution'
import type { Block } from '../lib/types'
import { courseTimeline } from '../lib/courseTimeline'

/** Vue d'effort : mesure actuelle, fenêtre glissante et un seul bloc à venir. */
export function CourseView({ session, samples, blocks, speed, incline, available }: {
  session: Session; samples: LiveSample[]; blocks: Block[]; speed: number | null; incline: number | null; available: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const block = blocks[session.block_index], next = blocks[session.block_index + 1]
  const active = session.active_s
  const remaining = Math.max(0, Math.ceil(block.end - active))
  const { x0, x1, measured, forecast, gaps } = useMemo(() => courseTimeline(samples, blocks, session.block_index, active), [samples, blocks, session.block_index, active])
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => { setSelected(null) }, [session.id])
  const cursor = selected !== null && selected >= x0 && selected <= x1 ? selected : null
  const point = cursor !== null && cursor <= active ? nearest(measured, cursor) : null
  const observed = point && cursor !== null && Math.abs(point.t - cursor) <= 2 ? point : null
  const planned = cursor !== null && next && cursor >= block.end ? next : block
  let readout: string | null = null
  if (cursor !== null) {
    if (cursor > (next?.end ?? block.end)) readout = 'Fin du programme'
    else if (cursor > active) readout = `Prévu ${clock(cursor)} · ${dec1(planned.speed)} km/h`
    else readout = observed && observed.speed !== null
      ? `${dec1(observed.speed)} km/h · ${clock(observed.t)}` : 'Mesure absente'
  }
  const inclineReadout = cursor === null ? (available && incline !== null ? `${dec1(incline)} %` : '-- %')
    : cursor > (next?.end ?? block.end) ? '-- %'
    : cursor > active ? `Prévu · ${dec1(planned.incline)} %`
    : observed?.incline != null ? `${dec1(observed.incline)} %` : 'Mesure absente'
  const series: Series[] = [
    { key: 'measured', data: measured, value: p => p.speed, color: 'var(--color-speed)', width: 2.5, area: true, maxGap: 2 },
    { key: 'previous-targets', data: measured, value: p => p.target, color: 'rgb(255 255 255 / .25)', width: 1, step: true, joinSteps: false, showPoint: false, maxGap: 2 },
    { key: 'forecast', data: forecast, value: p => p.target, color: 'rgb(255 255 255 / .55)', width: 1.3, step: true, joinSteps: false, showPoint: false, maxGap: Infinity },
  ]
  const inclineSeries: Series[] = [
    { key: 'incline', data: measured, value: p => p.incline, color: 'var(--color-incline)', width: 2, step: true, area: true, maxGap: 2 },
    { key: 'previous-inclines', data: measured, value: p => p.target_incline ?? null, color: 'var(--color-incline)', opacity: .25, width: 1, step: true, joinSteps: false, showPoint: false, maxGap: 2 },
    { key: 'forecast-incline', data: forecast, value: p => p.target_incline ?? null, color: 'var(--color-incline)', opacity: .55, width: 1.3, step: true, joinSteps: false, showPoint: false, maxGap: Infinity },
  ]
  const kcal = available ? calories(session.totals.energy) : null
  const distance = available && session.distance_m !== null ? dec2(session.distance_m / 1000) : null
  const currentPace = speed === null || speed === 0 ? '--' : pace(speed)
  const moving = ['running', 'transitioning', 'adjusting'].includes(session.phase)
  const maximum = Math.max(16, Math.ceil(Math.max(block.speed, next?.speed ?? 0, ...measured.map(p => p.speed ?? 0)) / 4) * 4)
  const inclineMaximum = Math.max(2, Math.ceil(Math.max(block.incline, next?.incline ?? 0, ...measured.map(p => p.incline ?? 0)) / 2) * 2)
  const markers = next ? [{ t: block.end, label: `Bloc suivant · ${next.label}` }] : []
  return <div ref={ref} className="course-view" aria-label="Vue course graphique">
    <div className="course-hero">
      <div>
        <p className="course-eyebrow">Allure actuelle</p>
        <p className={`course-pace num ${currentPace.length > 5 ? 'is-long' : ''} ${speed === null || speed === 0 ? 'is-missing' : ''}`}>
          {currentPace}<span>min/km</span>
        </p>
        <p className="course-measured num"><span><Gauge size={15} aria-hidden="true" /><span>{speed === null ? '--' : dec1(speed)} <small>km/h</small></span></span>
          <span><Mountain size={15} aria-hidden="true" /><span>{incline === null ? '--' : dec1(incline)} <small>%</small></span></span></p>
      </div>
    </div>
    <div className="course-block-heading">
      <div><span className="course-eyebrow">Bloc {session.block_index + 1} sur {blocks.length}</span><h2>{block.label}</h2></div>
      <div className="course-remaining">
        <strong className="num">{clock(remaining)}</strong>
        <span className="course-eyebrow">restantes</span>
      </div>
    </div>
    <div className="course-progress" role="progressbar" aria-label="Progression du bloc actuel" aria-valuemin={0} aria-valuemax={block.sec}
      aria-valuenow={Math.round(Math.max(0, Math.min(block.sec, active - block.start)))}>
      <span style={{ width: `${Math.max(0, Math.min(100, (active - block.start) / block.sec * 100))}%` }} />
    </div>
    <div className="course-chart" aria-label="Vitesse et inclinaison mesurées et prévues">
      <div className="course-legend"><span>{readout ?? <>Vitesse <small>km/h</small></>}</span>
        {cursor === null ? <><span><i />Mesurée</span><span><i />Objectif</span></> : <button type="button" onClick={() => setSelected(null)} className="course-chart-live">Retour au direct</button>}
      </div>
      <TimeChart series={series} x0={x0} x1={x1} y0={0} y1={maximum} height={width >= 600 ? 152 : width >= 340 ? 112 : 96} unit="km/h" stack="top"
        label="Vitesse mesurée et consigne, bloc actuel et suivant"
        present={active} cursor={cursor} onCursor={setSelected} gaps={gaps}
        live={available && speed !== null && moving && cursor === null}
        markers={markers} />
      {!measured.some(p => p.speed !== null) && <p className="course-chart-empty" role="status">{available ? 'En attente des premières mesures' : 'Mesures actuelles indisponibles'}</p>}
      <div className="course-incline-heading"><span>Inclinaison <small>%</small></span><strong className="num">{inclineReadout}</strong></div>
      <div className="course-incline-plot">
        <TimeChart series={inclineSeries} x0={x0} x1={x1} y0={0} y1={inclineMaximum} height={width >= 600 ? 80 : 64} unit="%" stack="bottom"
          label="Inclinaison mesurée et prévue, même instant que la vitesse"
          present={active} cursor={cursor} onCursor={setSelected} gaps={gaps} markers={markers}
          live={available && incline !== null && moving && cursor === null} />
        {!measured.some(p => p.incline != null) && <p className="course-incline-empty" role="status">{available ? 'En attente de la pente' : 'Pente actuelle indisponible'}</p>}
      </div>
    </div>
    <section className="course-next" aria-label="Prochain bloc">
      <div className="course-next-meta"><span>{next ? 'Bloc suivant' : 'Dernier bloc'}</span><span className="num">{next ? `Durée ${clock(next.sec)}` : 'Puis fin de séance'}</span></div>
      <div className="course-next-content">
        <div><h3>{next?.label ?? 'Fin du programme'}</h3><p className="num">{next ? `${dec1(next.speed)} km/h · ${dec1(next.incline)} %` : 'Arrêt automatique du tapis'}</p></div>
        {next && <p className="course-next-pace num">{pace(next.speed)}<span>min/km</span></p>}
      </div>
    </section>
    <dl className="course-totals">
      <div><dt>Durée active</dt><dd className="num text-time">{clock(Math.floor(active))}</dd></div>
      <div><dt>Distance{session.distance_quality === 'partial' && ' · partielle'}</dt><dd className={`num ${distance === null ? 'text-label-3' : 'text-distance'}`}>{distance ?? '--'}<small>km</small></dd></div>
      <div><dt>Kcal actives</dt><dd data-long-value={kcal && kcal.length > 7 ? true : undefined} className={`num ${kcal === null ? 'text-label-3' : 'text-energy'}`}>{kcal ?? '--'}</dd></div>
    </dl>
    {available && session.totals.energy.movement_ambiguous && kcal && <p className="course-footnote">Calories : deux estimations selon marche ou course.</p>}
    {available && session.totals.energy.weight_kg === null && <p className="course-footnote text-orange">Poids absent au départ : calories indisponibles.</p>}
  </div>
}
