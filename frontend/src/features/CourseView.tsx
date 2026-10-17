import { useMemo } from 'react'
import { TimeChart, useWidth, type Series } from '../components/charts'
import { calories, clock, dec1, dec2, pace } from '../lib/format'
import type { LiveSample, Session } from '../lib/execution'
import type { Block, Sample } from '../lib/types'

/** Vue d'effort : mesure actuelle, fenêtre glissante et un seul bloc à venir. */
export function CourseView({ session, samples, blocks, speed, incline, available }: {
  session: Session; samples: LiveSample[]; blocks: Block[]; speed: number | null; incline: number | null; available: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const block = blocks[session.block_index], next = blocks[session.block_index + 1]
  const active = session.active_s
  const remaining = Math.max(0, Math.ceil(block.end - active))
  const x0 = Math.max(block.start, Math.floor(active) - 90)
  const x1 = Math.max(x0 + 30, Math.min(next?.end ?? block.end, active + 120))
  const measured = useMemo(() => samples
    .filter(p => p.active_s >= x0 - 2 && p.active_s <= x1 && ['running', 'transitioning', 'adjusting'].includes(p.phase))
    .map(p => ({ ...p, t: p.active_s })), [samples, x0, x1])
  const planned: Sample[] = [
    { t: x0, target: block.speed, speed: null, incline: null },
    ...(next && block.end <= x1 ? [{ t: block.end, target: next.speed, speed: null, incline: null }] : []),
    { t: x1, target: next && x1 >= block.end ? next.speed : block.speed, speed: null, incline: null },
  ]
  const series: Series[] = [
    { key: 'measured', data: measured, value: p => p.speed, color: 'var(--color-speed)', width: 3, area: true, maxGap: 2 },
    { key: 'planned', data: planned, value: p => p.target, color: 'rgb(255 255 255 / .6)', width: 1.5, dash: '5 5', step: true, maxGap: Infinity },
  ]
  const kcal = available ? calories(session.totals.energy) : null
  const distance = available && session.distance_m !== null ? dec2(session.distance_m / 1000) : null
  const currentPace = speed === null || speed === 0 ? '--' : pace(speed)
  const maximum = Math.max(4, Math.ceil(Math.max(block.speed, next?.speed ?? 0, ...measured.map(p => p.speed ?? 0)) / 2) * 2)
  return <div ref={ref} className="course-view" aria-label="Vue course graphique">
    <div className="course-hero">
      <div>
        <p className="course-eyebrow">Allure actuelle</p>
        <p className={`course-pace num ${currentPace.length > 5 ? 'is-long' : ''} ${speed === null || speed === 0 ? 'is-missing' : ''}`}>
          {currentPace}<span>/km</span>
        </p>
        <p className="course-measured num"><span>{speed === null ? '--' : dec1(speed)} km/h</span><span className="text-incline">{incline === null ? '--' : dec1(incline)} %</span></p>
      </div>
      <div className="course-remaining">
        <span className="course-eyebrow">Reste du bloc</span>
        <strong className="num">{clock(remaining)}</strong>
      </div>
    </div>
    <div className="course-block-heading"><h2>{block.label}</h2><span className="num">Bloc {session.block_index + 1}/{blocks.length}</span></div>
    <div className="course-progress" role="progressbar" aria-label="Progression du bloc actuel" aria-valuemin={0} aria-valuemax={block.sec}
      aria-valuenow={Math.round(Math.max(0, Math.min(block.sec, active - block.start)))}>
      <span style={{ width: `${Math.max(0, Math.min(100, (active - block.start) / block.sec * 100))}%` }} />
    </div>
    <div className="course-chart" aria-label="Vitesse mesurée et aperçu des consignes">
      <div className="course-legend"><span><i />Mesuré</span><span><i />Consigne</span><span>km/h</span></div>
      <TimeChart series={series} x0={x0} x1={x1} y0={0} y1={maximum} height={width >= 600 ? 220 : width < 370 ? 128 : 144} unit="km/h"
        label="Vitesse mesurée et consigne, bloc actuel et suivant"
        cursor={available && speed !== null && ['running', 'transitioning', 'adjusting'].includes(session.phase) ? active : null}
        markers={next ? [{ t: block.end, sec: next.sec, label: next.label, color: 'var(--color-label-2)' }] : []} />
      {!measured.some(p => p.speed !== null) && <p className="course-chart-empty" role="status">{available ? 'En attente des premières mesures' : 'Mesures actuelles indisponibles'}</p>}
    </div>
    <section className="course-next" aria-label="Prochain bloc">
      <div className="course-next-meta"><span>{next ? 'Ensuite' : 'Dernier bloc'}</span><span className="num">Dans {clock(remaining)}</span></div>
      <div className="course-next-content">
        <div><h3>{next?.label ?? 'Fin du programme'}</h3><p className="num">{next ? `${clock(next.sec)} · ${dec1(next.speed)} km/h · ${dec1(next.incline)} %` : 'Arrêt automatique du tapis'}</p></div>
        {next && <p className="course-next-pace num">{pace(next.speed)}<span>/km</span></p>}
      </div>
    </section>
    <dl className="course-totals">
      <div><dt>Durée active</dt><dd className="num text-time">{clock(Math.floor(active))}</dd></div>
      <div><dt>Distance{session.distance_quality === 'partial' && ' · partielle'}</dt><dd className={`num ${distance === null ? 'text-label-3' : 'text-distance'}`}>{distance ?? '--'}<small>km</small></dd></div>
      <div><dt>Kcal actives</dt><dd className={`num ${kcal === null ? 'text-label-3' : 'text-energy'}`}>{kcal ?? '--'}<small>kcal</small></dd></div>
    </dl>
    {available && session.totals.energy.movement_ambiguous && kcal && <p className="course-footnote">Calories : deux estimations selon marche ou course.</p>}
    {available && session.totals.energy.weight_kg === null && <p className="course-footnote text-orange">Poids absent au départ : calories indisponibles.</p>}
  </div>
}
