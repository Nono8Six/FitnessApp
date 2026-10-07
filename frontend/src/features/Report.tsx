import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Page } from '../components/Shell'
import { nearest, TimeChart, type Marker, type Series } from '../components/charts'
import { Button, cx, Disclosure, Facts, Group, Metric, Skeleton, StatGrid, StatusLabel } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { clock, dec1, dec2 } from '../lib/format'
import { href } from '../lib/router'
import { phaseLabel, useExecution, type Phase } from '../lib/execution'
import { readRecording, recordingDate, recordingLabel, saveFeeling, type Recording, type RecordedEvent } from '../lib/recordings'

const percent = (v: number | null) => v === null ? '--' : `${Math.round(v * 100)} %`
const measured = (v: number | null, unit: string) => v === null ? '--' : `${dec1(v)} ${unit}`
const color = (role: string) => `var(--color-${role})`
const eventLabel = (event: RecordedEvent) => {
  const d = event.data
  if (event.kind === 'phase') return phaseLabel[String(d.label) as Phase] ?? String(d.label)
  if (event.kind === 'command_result') {
    const action = { speed: 'Vitesse', incline: 'Pente', start: 'Départ', stop: 'Arrêt', pause: 'Pause', request_control: 'Contrôle' }[String(d.action)] ?? String(d.action)
    const status = { sent: 'envoyée', accepted: 'acceptée · effet attendu', observed: 'effet observé', refused: 'refusée', unknown: 'résultat inconnu' }[String(d.status)] ?? String(d.status)
    return `${action}${typeof d.value === 'number' ? ` ${dec1(d.value)}` : ''} · ${status}`
  }
  return String(d.label ?? d.message ?? 'Événement')
}

function Feeling({ profile, data }: { profile: string; data: Recording }) {
  const [value, setValue] = useState(data.feeling), [saved, setSaved] = useState(data.feeling)
  const [open, setOpen] = useState(false), [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle'), [error, setError] = useState('')
  const alive = useRef(false), busy = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const save = async (next: number | null) => {
    if (busy.current) return
    busy.current = true; setValue(next); setState('saving'); setError('')
    try {
      const response = await saveFeeling(profile, data.id, next)
      if (alive.current) { setSaved(response.feeling); setState('saved') }
    } catch (e) {
      if (alive.current) { setState('error'); setError(`${errorMessage(e)}. Votre saisie est conservée ; réessayez.`) }
    } finally { busy.current = false }
  }
  return <section aria-label="Ressenti" className="report-feeling">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-title3">Ressenti{saved !== null && <span className="num ml-3 text-accent">{saved}<span className="text-footnote text-label-2"> /10</span></span>}</h2>
      <button type="button" disabled={!data.closed || state === 'saving'} aria-expanded={open} aria-controls="feeling-options"
        onClick={() => setOpen(v => !v)} className="pressable min-h-11 px-1 text-subhead font-semibold text-accent disabled:text-label-3">{open ? 'Fermer' : saved === null ? 'Ajouter' : 'Modifier'}</button>
    </div>
    {open && <div id="feeling-options">
      <p className="mb-3 text-footnote text-label-2">1 · Très facile <span className="float-right">10 · Maximal</span></p>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Effort ressenti de 1 à 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} type="button" aria-pressed={value === n} aria-label={`Ressenti ${n} sur 10`}
          disabled={state === 'saving'} onClick={() => void save(n)} className={cx('pressable num min-h-11 rounded-[12px] text-headline transition-colors disabled:opacity-60', value === n ? 'bg-accent text-on-accent' : 'bg-fill-3 text-label')}>{n}</button>)}
      </div>
      {saved !== null && <button type="button" disabled={state === 'saving'} onClick={() => void save(null)} className="pressable mt-2 min-h-11 text-subhead text-label-2">Effacer le ressenti</button>}
    </div>}
    <p role={state === 'error' ? 'alert' : 'status'} className={cx('min-h-[18px] text-footnote', state === 'error' ? 'text-red' : state === 'saved' ? 'text-green' : 'text-label-2')}>
      {state === 'saving' ? 'Enregistrement…' : state === 'saved' ? 'Enregistré' : state === 'error' ? error : !data.closed ? 'Disponible après la clôture' : saved === null ? 'Non renseigné · facultatif' : ''}
    </p>
    {state === 'error' && <Button variant="gray" className="mt-3 w-full" onClick={() => void save(value)}>Réessayer</Button>}
  </section>
}

function Curves({ data }: { data: Recording }) {
  const [cursor, setCursor] = useState<number | null>(null), [windowS, setWindowS] = useState(0), [end, setEnd] = useState(data.metrics.wall_s)
  const wall = Math.max(1, data.metrics.wall_s), x1 = Math.max(1, Math.min(wall, end)), x0 = windowS ? Math.max(0, x1 - windowS) : 0
  const point = cursor === null ? undefined : nearest(data.samples, cursor)
  const selected = point && Math.abs(point.t - cursor!) <= 1.5 ? point : undefined
  const gaps = useMemo(() => {
    const ranges: [number, number][] = []
    let start: number | undefined
    for (let i = 0; i < data.samples.length; i++) {
      const p = data.samples[i], previous = data.samples[i - 1]
      if (previous && p.t - previous.t > 2) ranges.push([previous.t, p.t])
      if (p.speed === null || p.incline === null) start ??= p.t
      else if (start !== undefined) { ranges.push([start, p.t]); start = undefined }
    }
    if (start !== undefined) ranges.push([start, wall])
    return ranges
  }, [data.samples, wall])
  const markers: Marker[] = useMemo(() => data.events.filter(e => ['adjustment', 'interruption', 'recovery'].includes(e.kind)
    || (e.kind === 'phase' && ['paused', 'running', 'unknown'].includes(String(e.data.label)))).map(e => ({ t: e.t, label: eventLabel(e),
      sec: e.data.label === 'paused' ? Math.max(0, (data.events.find(next => next.kind === 'phase' && next.t > e.t)?.t ?? wall) - e.t) : undefined,
      color: e.kind === 'adjustment' ? color('incline') : e.kind === 'interruption' || e.data.label === 'unknown' ? color('red') : e.data.label === 'running' ? color('green') : color('time') })), [data.events, wall])
  const speedCeiling = useMemo(() => Math.max(4, Math.ceil(data.samples.reduce((max, s) => Math.max(max, s.speed ?? 0, s.applied_speed ?? 0), 0) / 2) * 2), [data.samples])
  const speed: Series[] = useMemo(() => [
    { key: 'speed', data: data.samples, value: s => s.speed, color: color('speed'), area: true, width: 2.5, maxGap: 2 },
    { key: 'target', data: data.samples, value: s => 'applied_speed' in s ? s.applied_speed as number | null : null, color: 'rgb(255 255 255 / .6)', dash: '4 4', step: true, maxGap: 2 },
  ], [data.samples])
  const incline: Series[] = useMemo(() => [
    { key: 'incline', data: data.samples, value: s => s.incline, color: color('incline'), step: true, maxGap: 2 },
    { key: 'target_incline', data: data.samples, value: s => 'applied_incline' in s ? s.applied_incline as number | null : null, color: 'rgb(255 255 255 / .6)', dash: '4 4', step: true, maxGap: 2 },
  ], [data.samples])
  return <section aria-label="Courbes de la séance" className="report-curves">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="text-title3">Vitesse et pente</h2>
      <div className="flex rounded-full bg-fill-3 p-1" role="group" aria-label="Fenêtre des courbes">
        {[{ s: 0, label: 'Séance' }, { s: 300, label: '5 min' }].map(o => <button key={o.s} aria-pressed={windowS === o.s} onClick={() => { setWindowS(o.s); setEnd(wall); setCursor(null) }}
          className={cx('pressable min-h-11 rounded-full px-3 text-footnote font-semibold', o.s === windowS && 'bg-surface-3')}>{o.label}</button>)}
      </div>
    </div>
    <div className="report-readout" aria-live="polite">
      <div className="min-w-0 flex-1">
        <p className="num text-footnote text-label-2">{cursor === null ? 'Mesuré · consigne appliquée en pointillés' : `${clock(cursor)} depuis le départ`}</p>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-subhead">
          <span className="num text-speed">{cursor === null ? 'Vitesse' : measured(selected?.speed ?? null, 'km/h')}</span>
          <span className="num text-incline">{cursor === null ? 'Pente' : measured(selected?.incline ?? null, '%')}</span>
          {selected && <span className="num text-label-2">Consigne {measured(selected.applied_speed, 'km/h')} · {measured(selected.applied_incline, '%')}</span>}
          {cursor !== null && !selected && <span className="text-orange">Aucune mesure à cet instant</span>}
        </div>
      </div>
      {cursor !== null && <button aria-label="Effacer la lecture" onClick={() => setCursor(null)} className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-fill-3"><X size={17} /></button>}
    </div>
    {data.samples.length === 0 ? <p className="py-12 text-center text-subhead text-label-2">Aucune mesure conservée</p> : <>
      <TimeChart series={speed} x0={x0} x1={x1} y0={0} y1={speedCeiling} height={184} unit="km/h" label="Vitesse mesurée et consigne" gaps={gaps} markers={markers} cursor={cursor} onCursor={setCursor} />
      <div className="mt-2"><TimeChart series={incline} x0={x0} x1={x1} y0={0} y1={10} height={120} unit="%" label="Pente mesurée et consigne" gaps={gaps} markers={markers} cursor={cursor} onCursor={setCursor} /></div>
      {windowS > 0 && <div className="mt-3 flex items-center justify-between gap-2">
        <button disabled={x0 === 0} onClick={() => { setEnd(Math.max(windowS, end - windowS)); setCursor(null) }} className="pressable min-h-11 text-subhead text-accent disabled:text-label-3">Précédent</button>
        <span className="num text-footnote text-label-2">{clock(x0)} – {clock(x1)}</span>
        <button disabled={x1 === wall} onClick={() => { setEnd(Math.min(wall, end + windowS)); setCursor(null) }} className="pressable min-h-11 text-subhead text-accent disabled:text-label-3">Suivant</button>
      </div>}
    </>}
  </section>
}

function Blocks({ data }: { data: Recording }) {
  return <section className="mt-7" aria-label="Blocs prévus et réalisés"><h2 className="mb-3 text-title3">Blocs</h2>
    <Group>{data.workout.blocks.map((b, i) => {
      const m = data.metrics.blocks[i], done = m.active_s >= b.sec - 1, untouched = m.active_s === 0
      const applied = (key: 'applied_speed' | 'applied_incline', unit: string) => {
        const values = data.samples.filter(s => s.block_index === i && ['running', 'transitioning', 'adjusting'].includes(s.phase)).map(s => s[key]).filter((v): v is number => v !== null)
        if (!values.length) return '--'
        const lo = values.reduce((a, v) => Math.min(a, v)), hi = values.reduce((a, v) => Math.max(a, v))
        return `${dec1(lo)}${lo !== hi ? `–${dec1(hi)}` : ''} ${unit}`
      }
      return <div key={b.index} className="report-block">
        <div className="flex items-baseline justify-between gap-3"><h3 className="min-w-0 text-subhead font-semibold">{b.label}</h3><span className={cx('num shrink-0 text-footnote', untouched ? 'text-label-3' : 'text-time')}>{clock(m.active_s)} <span className="text-label-2">/ {clock(b.sec)}</span></span></div>
        <p className="mt-1 text-footnote text-label-2">{untouched ? 'Non réalisé' : done ? 'Réalisé' : 'Partiellement réalisé'}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 text-footnote">
          <dt className="text-label-2">Initial</dt><dd className="num text-right">{dec1(b.speed)} km/h</dd><dd className="num text-right">{dec1(b.incline)} %</dd>
          <dt className="text-label-2">Appliqué</dt><dd className="num text-right">{applied('applied_speed', 'km/h')}</dd><dd className="num text-right">{applied('applied_incline', '%')}</dd>
          <dt className="text-label-2">Mesuré · moy.</dt><dd className="num text-right text-speed">{measured(m.speed_avg, 'km/h')}</dd><dd className="num text-right text-incline">{measured(m.incline_avg, '%')}</dd>
        </dl>
        {!untouched && (m.speed_coverage !== 1 || m.incline_coverage !== 1) && <p className="mt-2 text-footnote text-orange">Couverture vitesse {percent(m.speed_coverage)} · pente {percent(m.incline_coverage)}</p>}
      </div>
    })}</Group>
  </section>
}

function Details({ data }: { data: Recording }) {
  const m = data.metrics, [eventCount, setEventCount] = useState(30)
  return <div className="grid gap-3">
    <Disclosure title="Données et qualité"><Facts rows={[
      ['Durée totale', clock(m.wall_s)], ['Pauses', clock(m.pause_s)], ['Durée prévue', clock(data.workout.summary.sec)],
      ['Couverture vitesse', percent(m.coverage.speed)], ['Couverture pente', percent(m.coverage.incline)],
      ['Compteur de distance', m.distance_quality === 'complete' ? 'Complet' : m.distance_quality === 'partial' ? 'Partiel' : 'Non reçu'],
      ['Couverture distance', percent(m.distance_coverage)], ['Cardio', 'Aucune source valide utilisée'],
      ['Notifications brutes', String(data.raw_count)], ['Données conservées jusqu’à', clock(data.checkpoint.wall_s)],
      ['Dernière écriture', new Date(data.persisted_at).toLocaleTimeString('fr-FR')],
      ['Enregistrement', data.closed ? data.lost_entries ? 'Partiel' : 'Clôturé' : 'En cours'],
      ['Arrêt moteur', data.checkpoint.stop_confirmed ? 'Confirmé' : 'Non confirmé'],
      ['Entrées perdues', String(data.lost_entries)], ['Version du calcul', m.version],
    ]} /><p className="px-4 pt-2 pb-4 text-footnote text-label-2">Moyennes pondérées par les secondes actives avec mesures valides aux deux extrémités. Aucun calcul à travers une coupure ; la distance provient des deltas du compteur du tapis.</p></Disclosure>
    <Disclosure title="Calories estimées"><Facts rows={[
      ['Poids au départ', measured(data.profile.weight_kg, 'kg')], ['Méthode partagée', 'ACSM'],
      ['Durée exploitable', clock(m.valid_s.energy)], ['Couverture', percent(m.coverage.energy)],
      ['Total avec repos', m.energy.total_kcal === null ? '--' : `≈ ${Math.round(m.energy.total_kcal)} kcal`],
    ]} /><p className="px-4 pt-2 pb-4 text-footnote text-label-2">{m.energy.active_kcal === null ? data.profile.weight_kg === null ? 'Poids absent au départ : aucune estimation pour cette séance.' : 'Mesures insuffisantes : aucune estimation.' : 'Estimation de locomotion sur les mesures valides, pas une mesure physiologique.'}{m.coverage.energy !== null && m.coverage.energy < .99 && ' Couverture partielle : les intervalles absents ne sont pas estimés.'}{m.energy.outside_range && ' Vitesses hors des plages usuelles du calcul : estimation moins sûre.'}</p></Disclosure>
    <Disclosure title={`Événements · ${data.events.length}`}><ol>{data.events.slice(0, eventCount).map((event, i) => <li key={i} className="report-event"><time className="num shrink-0 text-footnote text-label-2">{clock(event.t)}</time><span className="min-w-0 break-words text-footnote">{eventLabel(event)}</span></li>)}</ol>
      {data.events.length > eventCount && <button onClick={() => setEventCount(n => n + 50)} className="pressable min-h-11 w-full text-subhead text-accent">Événements suivants</button>}
    </Disclosure>
  </div>
}

export function Report({ profile, id }: { profile: string; id: string }) {
  const [data, setData] = useState<Recording>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const execution = useExecution(), live = execution.feed?.session
  useEffect(() => {
    let active = true, timer: number | undefined
    const load = async () => {
      try {
        const next = await readRecording(profile, id)
        if (active) { setData(next); setError(''); if (!next.closed) timer = window.setTimeout(load, 2000) }
      } catch (e) { if (active) setError(errorMessage(e)) }
    }
    void load()
    return () => { active = false; window.clearTimeout(timer) }
  }, [profile, id, revision])
  const m = data?.metrics
  const unresolved = data && (!data.closed || data.phase === 'unknown' || (live?.id === id && live.phase === 'unknown'))
  return <Page title={data?.name ?? 'Bilan'} subtitle={data && recordingDate(data.started_at)} back={{ label: 'Bilans', href: href.recordings }}>
    {error ? <WorkoutError message={error} retry={() => setRevision(v => v + 1)} /> : !data || !m ? <Skeleton label="Chargement du bilan" /> : <>
      {unresolved && <div className="mb-5 rounded-[14px] bg-red/15 p-4 text-subhead text-red" role="alert"><p>{data.phase === 'unknown' ? 'Arrêt non confirmé. Utilisez le STOP physique ; la récupération reste dans Direct.' : 'Séance non clôturée. Les mesures affichées sont celles déjà conservées.'}</p><a href={href.direct} className="pressable mt-2 inline-flex min-h-11 items-center font-semibold underline">Retrouver Direct</a></div>}
      {!unresolved && data.phase === 'interrupted' && !data.checkpoint.stop_confirmed && <p role="alert" className="mb-5 rounded-[14px] bg-orange/15 p-4 text-subhead text-orange">{data.mode === 'simulation' ? 'Processus interrompu · arrêt du simulateur non confirmé. Les données s’arrêtent au dernier lot conservé.' : 'Arrêt du tapis non confirmé au moment de l’interruption. Vérifiez la bande et utilisez le STOP physique si nécessaire.'}</p>}
      {data.lost_entries > 0 && <p role="alert" className="mb-4 rounded-[14px] bg-orange/15 p-4 text-subhead text-orange">Enregistrement partiel · {data.lost_entries} entrées perdues. Le bilan utilise uniquement les données conservées.</p>}
      <div className="report-layout">
        <div className="report-summary">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-subhead"><StatusLabel tone={data.phase === 'completed' ? 'green' : data.phase === 'interrupted' || data.phase === 'unknown' ? 'orange' : 'gray'}>{recordingLabel(data.phase)}</StatusLabel><span className="text-footnote text-label-2">Version {data.workout.version}</span></div>
          <div className={cx('report-duration', clock(m.active_s).length > 6 && 'is-long', clock(m.active_s).length > 8 && 'is-very-long')}><Metric label="Durée active" value={clock(m.active_s)} color={color('time')} size="lg" /></div>
          <StatGrid compact stats={[
            { label: 'Distance', value: m.distance_m === null ? null : dec2(m.distance_m / 1000), unit: 'km', color: color('distance') },
            { label: 'Kcal actives', value: m.energy.active_kcal === null ? null : `≈ ${Math.round(m.energy.active_kcal)}`, unit: 'kcal', color: color('energy') },
            { label: 'Vitesse moy.', value: m.speed_avg === null ? null : dec1(m.speed_avg), unit: 'km/h', color: color('speed') },
            { label: 'Pente moy.', value: m.incline_avg === null ? null : dec1(m.incline_avg), unit: '%', color: color('incline') },
          ]} />
          {(m.distance_quality === 'partial' || (m.coverage.energy !== null && m.coverage.energy < .99) || (m.coverage.speed !== null && m.coverage.speed < .99)) && <p className="mt-2 px-1 text-footnote text-orange">Mesures partielles · voir Données et qualité</p>}
          <Feeling profile={profile} data={data} />
        </div>
        <div className="report-exploration"><Curves data={data} /><Blocks data={data} /></div>
        <div className="report-details"><Details data={data} /></div>
      </div>
    </>}
  </Page>
}
