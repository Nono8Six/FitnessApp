import { Bluetooth, ChartNoAxesCombined, Check, ChevronDown, Gauge, Minus, Pause, Play, Plus, Square, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { nearest, ProgrammeMini, TimeChart, type Series } from '../components/charts'
import { Button, cx, Disclosure, Facts, Group, Segmented, Sheet } from '../components/ui'
import { calories, clock, dec1, dec2 } from '../lib/format'
import { currentMeasurement, inProgress, phaseLabel, prepareExecution, useExecution, type LiveSample, type Preparation } from '../lib/execution'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { useCurrentProfile } from '../lib/profiles'
import type { Workout } from '../lib/workouts'
import type { Block } from '../lib/types'
import { CourseChart, CourseReadout, NextBlock } from './CourseView'
import { courseTest } from '../lib/environment'

export function StartButton({ profile, workout, className }: { profile: string; workout: Workout; className?: string }) {
  const e = useExecution()
  return <Button className={className} onClick={() => e.select(profile, workout)}>{inProgress(e.feed?.session.phase) ? 'Retrouver le Direct' : 'Commencer'}</Button>
}

function Confirmations({ keyReady, clear, setKey, setClear }: { keyReady: boolean; clear: boolean; setKey: (v: boolean) => void; setClear: (v: boolean) => void }) {
  return <Group className="mt-5">
    {[{ label: 'Clé de sécurité en place', value: keyReady, change: setKey }, { label: 'Bande libre', value: clear, change: setClear }].map(item =>
      <label key={item.label} className="flex min-h-[60px] cursor-pointer items-center gap-3 px-4 text-body [&+&]:shadow-[inset_0_0.5px_0_var(--color-sep)]">
        <input type="checkbox" checked={item.value} onChange={event => item.change(event.target.checked)} className="size-6 shrink-0 accent-accent" />
        {item.label}
      </label>)}
  </Group>
}

export function ExecutionSheets() {
  const e = useExecution()
  const [prepared, setPrepared] = useState<Preparation>()
  const [issue, setIssue] = useState<string>()
  const [keyReady, setKey] = useState(false), [clear, setClear] = useState(false)
  const [checking, setChecking] = useState(false), [revision, setRevision] = useState(0)
  const s = e.feed?.session
  const open = e.preparing || e.confirmingResume
  const resume = e.confirmingResume
  useEffect(() => {
    setKey(false); setClear(false)
  }, [e.preparing, e.confirmingResume, e.selected])
  useEffect(() => {
    setPrepared(undefined); setIssue(undefined)
    if (!e.preparing || !e.selected) return
    let active = true
    setChecking(true)
    prepareExecution(e.selected.profile, e.selected.workout).then(value => { if (active) setPrepared(value) })
      .catch(error => { if (active) setIssue(errorMessage(error)) }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [e.preparing, e.confirmingResume, e.selected, revision])
  const close = () => { if (!e.pending) { e.clearSelected(); e.setConfirmingResume(false) } }
  const mode = resume ? s?.mode : prepared?.mode ?? e.feed?.device.mode
  const limits = resume ? s?.limits : prepared?.limits
  const live = e.status === 'live' && e.now - e.receivedAt < 5000
  const connected = live && e.feed?.device.phase === 'connected'
  const ready = resume ? s?.phase === 'paused' && (s.can_resume ?? s.owned_by_me) && s.restart_delay_s === 0 && currentMeasurement(e, 'speed_kmh') === 0
    : prepared?.ready && e.feed?.device.phase === 'connected' && currentMeasurement(e, 'speed_kmh') === 0
  const message = issue ?? e.error ?? (resume ? s?.restart_delay_s ? `La bande se stabilise · encore ${s.restart_delay_s} s` : undefined : prepared?.issue)
  const settings = () => { e.setPreparing(false); e.setConfirmingResume(false); navigate(href.treadmill) }
  return <Sheet open={open} onClose={close} title={`${resume ? 'Avant de reprendre' : 'Avant de démarrer'}${mode === 'simulation' ? ' · Simulation' : ''}`}
    leading={<button type="button" onClick={close} disabled={!!e.pending} className="pressable -ml-2 min-h-11 px-2 text-body text-accent">Annuler</button>}
    footer={<Button className="w-full" disabled={!live || !ready || !keyReady || !clear || !!e.pending || checking}
      onClick={() => void e.act(resume ? 'resume' : 'start', keyReady && clear)}>{e.pending ? 'Vérification…' : resume ? 'Reprendre' : 'Démarrer'}</Button>}>
    <p className="mt-2 text-title2 break-words">{resume ? s?.workout?.name : e.selected?.workout.name}</p>
    <p className="mt-1 text-subhead text-label-2">{resume ? `${s?.profile?.name} · reprise à ${clock(Math.floor(s?.active_s ?? 0))}` : `${prepared?.profile.name ?? ''} · ${clock(e.selected?.workout.summary.sec ?? 0)}`}</p>
    <div className="mt-5 flex min-h-11 items-center gap-3 text-subhead">
      <Bluetooth size={20} className={connected ? 'text-green' : 'text-label-2'} />
      <span className="flex-1">{e.feed?.device.device_name ?? 'Tapis non connecté'}</span>
      {checking ? <span role="status" className="text-label-2">Vérification…</span> : connected && <Check size={18} className="text-green" />}
    </div>
    {message && <p role="alert" className="mt-2 rounded-[12px] bg-orange/15 px-4 py-3 text-subhead text-orange">{message}</p>}
    {!live && <p role="alert" className="mt-2 text-subhead text-orange">{e.status === 'loading' ? 'Connexion au PC en cours…' : 'Contact avec le PC perdu. Reconnexion en cours…'}</p>}
    {(!ready && !checking) && <div className="mt-3 flex gap-2">
      <Button variant="gray" size="md" onClick={settings}>Réglages du tapis</Button>
      {!resume && <Button variant="plain" size="md" disabled={checking} onClick={() => setRevision(v => v + 1)}>Revérifier</Button>}
    </div>}
    <Confirmations keyReady={keyReady} clear={clear} setKey={setKey} setClear={setClear} />
    <Disclosure title="Tapis et limites" className="mt-4"><Facts rows={[
      ['Pilotage', 'Gardez le PC allumé et connecté au tapis.'],
      ['Vitesse maximale', limits ? `${dec1(limits.speed)} km/h` : 'En cours de vérification'],
      ['Pente maximale', limits ? `${dec1(limits.incline)} %` : 'En cours de vérification'],
      ['Mode', mode === 'simulation' ? 'Simulation' : mode === 'reel' ? 'RUN500 réel' : 'En cours de vérification'],
    ]} /></Disclosure>
  </Sheet>
}

export function ReturnToPreparation() {
  const e = useExecution()
  if (!e.selected || e.preparing) return null
  return <div className="mx-auto max-w-[680px] px-4 pb-36 desk:max-w-[1180px] desk:px-10 desk:pb-6">
    <Button className="w-full" onClick={() => { navigate(e.selected!.origin); e.setPreparing(true) }}>Revenir à « {e.selected.workout.name} »</Button>
  </div>
}

export function Activity({ desktop = false }: { desktop?: boolean }) {
  const e = useExecution(), s = e.feed?.session
  if (!s || !inProgress(s.phase) || !s.workout) return null
  const speed = currentMeasurement(e, 'speed_kmh'), block = s.workout.blocks[s.block_index]
  const paused = s.phase === 'paused'
  const live = e.status === 'live' && e.now - e.receivedAt < 5000
  const canPause = live && ['running', 'transitioning', 'adjusting'].includes(s.phase)
  return <div className={desktop ? 'live-activity-desktop' : 'live-activity-mobile'}>
    <a href={href.direct} className="min-w-0 flex-1 py-2 pl-4">
      <span className="flex items-center gap-1.5 text-footnote font-semibold"><span className={cx('size-1.5 rounded-full', paused ? 'bg-yellow' : s.phase === 'unknown' ? 'bg-red' : 'bg-green')} />
        {live ? phaseLabel[s.phase] : 'Observation interrompue'}{s.mode === 'simulation' && <span className="text-orange"> · Simulation</span>}</span>
      <p className="truncate text-subhead font-semibold">{block.label}</p>
      <p className="num text-footnote text-label-2"><span className="text-time">{clock(Math.floor(s.active_s))}</span> · <span className={speed === null ? 'text-label-3' : 'text-speed'}>{speed === null ? '--' : dec1(speed)}</span> km/h</p>
    </a>
    <button type="button" disabled={!(paused ? (s.can_resume ?? s.owned_by_me) && live && !e.pending : canPause)}
      aria-label={paused ? 'Reprendre la séance' : 'Mettre la séance en pause'}
      onClick={() => paused ? e.setConfirmingResume(true) : void e.act('pause')}
      className={cx('pressable mr-3 grid size-11 shrink-0 place-items-center rounded-full bg-fill-3 disabled:text-label-3', paused ? 'text-green' : 'text-yellow')}>
      {paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
    </button>
  </div>
}

const LiveCurves = memo(function LiveCurves({ samples, markers, wall, startedAt, live }: { samples: LiveSample[]; markers: { t: number; label: string }[]; wall: number; startedAt: string | null; live: boolean }) {
  const [windowS, setWindowS] = useState(300), [cursor, setCursor] = useState<number | null>(null)
  const x1 = Math.max(60, Math.ceil(wall)), x0 = windowS ? Math.max(0, x1 - windowS) : 0
  const point = cursor === null ? undefined : nearest(samples, cursor)
  const selected = point && Math.abs(point.t - cursor!) <= 1.5 ? point : undefined
  const gaps = useMemo(() => {
    const ranges: [number, number][] = []
    let start: number | undefined
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], previous = samples[i - 1]
      if (previous && p.t - previous.t > 2) ranges.push([previous.t, p.t])
      if (p.speed === null || p.incline === null) start ??= p.t
      else if (start !== undefined) { ranges.push([start, p.t]); start = undefined }
    }
    if (start !== undefined) ranges.push([start, wall])
    return ranges
  }, [samples, wall])
  const speedSeries: Series[] = useMemo(() => [
    { key: 'speed', data: samples, value: p => p.speed, color: 'var(--color-speed)', width: 2.5, area: true, maxGap: 2 },
    { key: 'target', data: samples, value: p => p.target, color: 'rgb(255 255 255 / .6)', dash: '4 4', step: true, maxGap: 2 },
  ], [samples])
  const inclineSeries: Series[] = useMemo(() => [
    { key: 'incline', data: samples, value: p => p.incline, color: 'var(--color-incline)', width: 2, step: true, maxGap: 2 },
  ], [samples])
  const stamp = selected && startedAt ? new Date(new Date(startedAt).getTime() + selected.t * 1000).toLocaleTimeString('fr-FR') : ''
  return <section className="live-curves" aria-label="Courbes de la séance">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-title3">Vitesse et pente</h2>
      <div className="flex rounded-full bg-fill-3 p-1" role="group" aria-label="Fenêtre des courbes">
        {[{ v: 60, label: '1 min' }, { v: 300, label: '5 min' }, { v: 0, label: 'Séance' }].map(option => <button key={option.v} type="button" aria-pressed={windowS === option.v}
          onClick={() => { setWindowS(option.v); setCursor(null) }} className={cx('pressable min-h-11 rounded-full px-2.5 text-footnote font-semibold', windowS === option.v && 'bg-surface-3')}>{option.label}</button>)}
      </div>
    </div>
    <div className="live-chart-readout" aria-live="polite">
      <div className="min-w-0 flex-1">
        <p className="num text-footnote text-label-2">{selected ? `Lecture à ${stamp} · ${clock(selected.t)} depuis le départ` : cursor !== null ? `${clock(cursor)} depuis le départ` : 'Mesures reçues · cible en pointillés'}</p>
        <p className="num mt-1 flex flex-wrap gap-x-4 text-subhead">
          <span className="text-speed">{selected ? selected.speed === null ? '--' : dec1(selected.speed) : 'Vitesse'}{selected && ' km/h'}</span>
          <span className="text-label-2">{selected ? `Cible ${dec1(selected.target)} km/h` : 'Cible'}</span>
          <span className="text-incline">{selected ? selected.incline === null ? '--' : `${dec1(selected.incline)} %` : 'Pente'}</span>
          {cursor !== null && !selected && <span className="text-orange">Aucune mesure à cet instant</span>}
        </p>
      </div>
      {cursor !== null && <button type="button" aria-label="Revenir aux mesures actuelles" onClick={() => setCursor(null)} className="pressable grid size-11 place-items-center rounded-full bg-fill-3"><X size={17} /></button>}
    </div>
    <TimeChart series={speedSeries} x0={x0} x1={x1} y0={0} y1={Math.max(4, ...samples.map(p => Math.max(p.speed ?? 0, p.target)))}
      height={170} unit="km/h" label="Vitesse reçue et cible" gaps={gaps} markers={markers} cursor={cursor} onCursor={setCursor} live={live} />
    <TimeChart series={inclineSeries} x0={x0} x1={x1} y0={0} y1={10} height={92} unit="%" label="Pente reçue" gaps={gaps} markers={markers} cursor={cursor} onCursor={setCursor} />
  </section>
})

function Progress({ blocks, active }: { blocks: Block[]; active: number }) {
  const total = blocks.at(-1)?.end ?? 1
  return <div className="relative overflow-hidden rounded-[4px]" aria-label={`Progression : ${clock(active)} sur ${clock(total)}`} role="img">
    <div className="opacity-25"><ProgrammeMini blocks={blocks} height={64} /></div>
    <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - Math.min(100, active / total * 100)}% 0 0)` }}><ProgrammeMini blocks={blocks} height={64} /></div>
  </div>
}

function LiveAdjustments() {
  const e = useExecution(), s = e.feed!.session
  const enabled = s.owned_by_me && ['running', 'adjusting'].includes(s.phase) && (!e.pending || e.pending === 'adjust') && e.status === 'live'
    && e.now - e.receivedAt < 5000 && currentMeasurement(e, 'speed_kmh') !== null && currentMeasurement(e, 'incline_pct') !== null
  const target = s.targets[s.block_index]
  const offsets = e.adjustment ?? s.offsets
  const limited = (['speed', 'incline'] as const).filter(action => s.adjustment_bounds && offsets[action] + s.adjustment_bounds[action].step > s.adjustment_bounds[action].max + 1e-6)
  const limitHint = limited.length === 2 ? 'Limites atteintes dans les blocs restants' : limited.length ? `Un bloc restant limite la ${limited[0] === 'speed' ? 'vitesse' : 'pente'}` : undefined
  return <div className="live-adjustments" role="group" aria-label="Consignes pour le reste de la séance">
    {(['speed', 'incline'] as const).map(action => {
      const label = action === 'speed' ? 'Vitesse' : 'Pente', unit = action === 'speed' ? 'km/h' : '%'
      const range = s.adjustment_bounds?.[action]
      const value = target[action] + offsets[action] - s.offsets[action]
      return <div className="live-adjust-row" key={action}>
        <span className="text-subhead text-label-2">{label}</span>
        <div className="live-adjust-stepper">
          <button type="button" aria-label={`Diminuer la ${label.toLowerCase()} de ${dec1(range?.step ?? .5)} ${unit} pour le reste de la séance`} disabled={!enabled || !range || offsets[action] - range.step < range.min - 1e-6} onClick={() => e.changeAdjustment(action, -1)}><Minus size={20} /></button>
          <span className={cx('live-adjust-value num', action === 'speed' ? 'text-speed' : 'text-incline')}>{dec1(value)}<small>{unit}</small></span>
          <button type="button" aria-label={`Augmenter la ${label.toLowerCase()} de ${dec1(range?.step ?? .5)} ${unit} pour le reste de la séance`} disabled={!enabled || !range || offsets[action] + range.step > range.max + 1e-6} onClick={() => e.changeAdjustment(action, 1)}><Plus size={20} /></button>
        </div>
      </div>
    })}
    <p className="live-adjust-hint" role="status">{e.adjustment || s.phase === 'adjusting' ? 'Cible demandée · effet attendu' : !s.owned_by_me && inProgress(s.phase) ? 'Réglages sur l’écran qui a démarré la séance'
      : s.adjustment_note ?? limitHint ?? 'Appliqué aux blocs restants'}</p>
  </div>
}

export function Direct() {
  const e = useExecution(), s = e.feed?.session, profile = useCurrentProfile()
  const [showPace, setShowPace] = useState(profile?.speed_unit === 'pace')
  const [view, setView] = useState<'metrics' | 'graph'>('graph')
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const speed = currentMeasurement(e, 'speed_kmh'), incline = currentMeasurement(e, 'incline_pct')
  const available = e.status === 'live' && (e.now - e.receivedAt) < 5000
  const blocks = useMemo(() => s?.workout?.blocks.map((b, i) => ({ ...b, ...s.targets[i] })) ?? [], [s?.workout, s?.targets])
  const block = blocks[s?.block_index ?? 0], next = blocks[(s?.block_index ?? 0) + 1]
  const total = s?.workout?.summary.sec ?? 0
  const finished = s && ['stopped', 'completed', 'cancelled'].includes(s.phase)
  useEffect(() => {
    if (finished && s.id && s.recording?.status === 'saved' && s.profile?.id === profile?.id && e.status === 'live') navigate(href.report(s.id))
  }, [finished, s?.id, s?.recording?.status, s?.profile?.id, profile?.id, e.status])
  const paused = s?.phase === 'paused'
  const statusTone = !available ? 'text-orange' : s?.phase === 'unknown' ? 'text-red' : paused ? 'text-yellow' : 'text-green'
  const reduce = () => navigate(href.today)
  if (!s || !s.workout || !s.id) return <div className="live-screen"><div className="live-empty">
    <h1 className="text-title1">Direct</h1><p className="mt-3 text-label-2" role="status">{e.status === 'loading' ? 'Chargement de la séance…' : e.status === 'offline' ? 'État de séance indisponible. Attendez la reconnexion au PC.' : 'Aucune séance en cours'}</p>
    <Button className="mt-6" onClick={() => navigate(href.today)}>Aujourd’hui</Button>
  </div></div>
  const error = !available ? 'PC déconnecté. État du tapis inconnu. Utilisez le STOP physique si nécessaire.'
    : s.phase === 'unknown' ? s.error ?? 'État de la bande inconnu. Utilisez le STOP physique, puis reconnectez.'
    : e.error ?? s.error ?? (speed === null || incline === null ? 'Mesures du tapis indisponibles.' : undefined)
  const canPause = available && ['running', 'transitioning', 'adjusting'].includes(s.phase)
  const canResume = available && paused && (s.can_resume ?? s.owned_by_me) && s.restart_delay_s === 0 && speed === 0
  const kcal = calories(s.totals.energy)
  const distance = available && (s.distance_quality === 'fresh' || s.distance_quality === 'partial') && s.distance_m !== null ? dec2(s.distance_m / 1000) : '—'
  const canStop = available && !finished && s.phase !== 'unknown' && s.phase !== 'stopping'
  return <div className={cx('live-screen', view === 'graph' && 'is-graph', paused && 'is-paused')}>
    <header className="live-header">
      <button type="button" aria-label="Réduire le Direct" onClick={reduce} className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-fill-3"><ChevronDown size={25} /></button>
      <div className="live-heading min-w-0 flex-1"><h1 className="truncate text-headline">{s.workout.name}</h1></div>
      {courseTest ? <a href="/#/" aria-label="Quitter le test et revenir à l’application" className="live-test-exit pressable"><span>Simulation</span><X size={16} aria-hidden /></a>
        : s.mode === 'simulation' && <span className="live-mode">Simulation</span>}
    </header>
    <div className="live-view-toolbar">
      <p role="status" className={cx('live-status', statusTone)}><span className="size-1.5 shrink-0 rounded-full bg-current" />{available ? phaseLabel[s.phase] : 'Hors ligne'}</p>
      <Segmented variant="course" label="Affichage du Direct" value={view} onChange={setView} options={[
        { value: 'metrics', label: 'Données', icon: <Gauge size={15} aria-hidden="true" /> },
        { value: 'graph', label: 'Graphique', icon: <ChartNoAxesCombined size={15} aria-hidden="true" /> },
      ]} />
    </div>
    {s.phase === 'countdown' ? <div className="live-countdown">
      <strong key={s.countdown} className="num animate-pop" aria-label={`Départ dans ${s.countdown} secondes`}>{s.countdown}</strong>
      <p className="text-subhead text-label-2">{block?.label} · cible {dec1(block?.speed ?? 0)} km/h</p>
      <Button variant="gray" className="mt-8 min-w-48" onClick={() => void e.act('stop')}>Annuler le démarrage</Button>
      {e.error && <p role="alert" className="mt-4 text-red">{e.error}</p>}
    </div> : <div className="live-layout">
      <div className="live-content" key={view}>
        <section className="live-primary" aria-label="Mesures de la séance">
          <CourseReadout block={block} index={s.block_index} count={blocks.length} active={s.active_s} available={available}
            speed={speed} incline={incline} showPace={view === 'graph' || showPace} onToggle={view === 'metrics' ? () => setShowPace(v => !v) : undefined} />
          <NextBlock next={next} />
          {view === 'graph' && <CourseChart session={s} samples={e.feed!.samples} blocks={blocks} available={available} hasMeasurement={speed !== null || incline !== null} />}
          <dl className="course-totals" data-columns={view === 'metrics' ? 2 : 3}>
            <div><dt>Durée active</dt><dd className="num text-time">{available ? clock(Math.floor(s.active_s)) : '—'}</dd></div>
            <div><dt>Distance{s.distance_quality === 'partial' && ' partielle'}</dt><dd className="num text-distance">{distance}<small>km</small></dd></div>
            <div><dt>Kcal estimées</dt><dd className="num text-energy" data-long-value={!!kcal && kcal.length > 7 || undefined}>{available ? kcal ?? '—' : '—'}</dd></div>
            {view === 'metrics' && <div><dt>Vitesse moyenne</dt><dd className="num text-speed">{available && s.totals.speed_avg !== null ? dec1(s.totals.speed_avg) : '—'}<small>km/h</small></dd></div>}
          </dl>
        </section>
        <div className="live-detail">
          <Disclosure title="Ajuster la séance" className="live-panel"><LiveAdjustments /></Disclosure>
          {view === 'metrics' && <>
            {blocks.length > s.block_index + 2 && <Disclosure className="live-panel" title={`Suite du programme · ${blocks.length - s.block_index - 2} ${blocks.length - s.block_index - 2 === 1 ? 'bloc' : 'blocs'}`}>
              <ol className="live-upcoming">
                {blocks.slice(s.block_index + 2).map(b => <li key={b.index}>
                  <span className="live-upcoming-index num">{b.index + 1}</span>
                  <div><h3>{b.label}</h3><p className="num">{dec1(b.speed)} km/h · {dec1(b.incline)} %</p></div>
                  <span className="num text-time">{clock(b.sec)}</span>
                </li>)}
              </ol>
            </Disclosure>}

            <Disclosure title="Programme complet" className="live-panel">
              <section className="live-programme" aria-label="Progression du programme"><p className="num mb-2 text-footnote text-label-2">{clock(Math.floor(s.active_s))} / {clock(total)}</p><Progress blocks={blocks} active={s.active_s} /></section>
            </Disclosure>
            <Disclosure title="Historique des mesures" className="live-panel">
              <LiveCurves samples={e.feed?.samples ?? []} markers={e.feed?.markers ?? []} wall={s.wall_s} startedAt={s.started_at} live={available && canPause} />
            </Disclosure>
          </>}
          <Disclosure title="État du tapis" className="live-panel">
            <Facts rows={[
              ['Profil', `${s.profile?.name} · Version ${s.workout.version}`],
              ['Pilotage', 'PC · indépendant du téléphone'],
              ['Enregistrement', s.recording.status === 'error' ? s.recording.error ?? 'Erreur' : s.recording.status === 'saved' ? 'Enregistré' : `En cours · conservé jusqu’à ${clock(s.recording.persisted_s)}`],
              ['Écran allumé', e.screenAwake.status === 'active' ? 'Anti-veille actif' : 'Selon les réglages du téléphone'],
              ['Écran', s.owned_by_me ? 'Commandes actives' : 'Observation · arrêt et pause accessibles'],
              ['Tapis', e.feed?.device.phase === 'connected' ? 'Connecté' : 'Déconnecté · bande inconnue'],
              ['Commande', s.command ? `${s.command.status === 'sent' ? 'Envoyée' : s.command.status === 'accepted' ? 'Acceptée · effet attendu' : s.command.status === 'observed' ? 'Effet observé' : s.command.status === 'unknown' ? 'Résultat inconnu' : 'Refusée'}` : 'Aucune'],
              ['Pause cumulée', clock(Math.floor(s.pause_s))],
              ['Calories actives', s.totals.energy.weight_kg === null ? 'Poids absent au départ' : 'Estimation ACSM'],
              ['Couverture calories', s.totals.coverage.energy === null ? '--' : `${Math.round(s.totals.coverage.energy * 100)} % du temps actif`],
              ['Couverture vitesse moyenne', s.totals.coverage.speed === null ? '--' : `${Math.round(s.totals.coverage.speed * 100)} % du temps actif`],
              ['Limite du calcul', s.totals.energy.movement_ambiguous ? 'Deux scénarios marche/course · pas une mesure ni un intervalle garanti' : s.totals.energy.outside_range ? 'Vitesse hors des plages usuelles ACSM · estimation moins sûre' : 'Calories estimées, pas une mesure physiologique'],
              ['Autorisation restante', clock(s.authorization_remaining_s)],
              ...(['speed_kmh', 'incline_pct'] as const).map(key => {
                const m = e.feed!.device.measurements[key]
                const age = m.age_s === null ? null : Math.ceil(m.age_s + Math.max(0, (e.now - e.receivedAt) / 1000))
                return [key === 'speed_kmh' ? 'Dernière vitesse' : 'Dernière pente', m.value === null ? 'Non reçue' : `${dec1(m.value)} ${key === 'speed_kmh' ? 'km/h' : '%'} · il y a ${age ?? '--'} s`] as const
              }),
            ]} />
          </Disclosure>
          {s.owned_by_me && !finished && e.screenAwake.status !== 'active' && <button type="button" className="pressable min-h-11 text-subhead text-orange" disabled={e.screenAwake.status === 'requesting'} onClick={() => void e.screenAwake.request()}>{e.screenAwake.status === 'requesting' ? 'Activation de l’anti-veille…' : 'Activer l’anti-veille'}</button>}
        </div>
      </div>
      <div className="live-controls-wrap" role="region" aria-label="Commandes de la séance">
        <div className="live-control-messages">
          {error && <p role="alert" className={cx('live-notice', s.phase === 'unknown' && 'is-urgent')}>{error}</p>}
          {s.recording && s.recording.status === 'error' && <p role="alert" className="mb-3 text-footnote text-red">
            {`${s.recording.error ?? 'Enregistrement interrompu.'} Données conservées jusqu’à ${clock(s.recording.persisted_s)} depuis le départ.`}
          </p>}
          {finished && s.recording?.status === 'error' && <a href={href.report(s.id)} className="pressable mb-3 flex min-h-11 items-center text-subhead text-accent">Consulter les données conservées</a>}
          {s.can_claim && <Button variant="gray" className="mb-3 w-full" disabled={!available || !!e.pending} onClick={() => void e.act('claim')}>Reprendre le contrôle sur cet écran</Button>}
          {paused && s.reason && s.reason !== 'Pause demandée' && <p role="status" className="mb-2 text-footnote text-yellow">{s.reason}</p>}
          {paused && (!(s.can_resume ?? s.owned_by_me) || s.restart_delay_s > 0) && <p className="live-action-hint text-label-2">{!(s.can_resume ?? s.owned_by_me) ? 'Reprise depuis l’écran de départ' : `Stabilisation · ${s.restart_delay_s} s`}</p>}
          {s.phase === 'unknown' && <Button variant="plain" className="mb-2 w-full" onClick={() => navigate(href.treadmill)}>Reconnecter dans Réglages</Button>}
          {s.phase === 'unknown' && e.feed?.device.read_only && e.feed.device.phase === 'connected' && speed === 0 && <Button variant="gray" className="mb-3 w-full" onClick={() => void e.act('recover')}>Clore la séance interrompue</Button>}
        </div>
        {finished ? <div className="live-finish">
          <p role="status" className="text-subhead text-green">{s.stop_confirmed ? 'Arrêt confirmé · 0,0 km/h' : s.phase === 'cancelled' ? 'Aucun mouvement demandé' : s.reason}</p>
          <Button className="mt-3 w-full" variant="gray" onClick={reduce}>Terminer</Button>
        </div> : <div className="live-controls">
          <button type="button" className={cx('live-control', paused ? 'resume' : 'pause')} disabled={!(paused ? canResume && !e.pending : canPause)}
            onClick={() => paused ? e.setConfirmingResume(true) : void e.act('pause')}>
            <span>{paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}</span><b>{paused ? 'Reprendre' : 'Pause'}</b>
          </button>
          <button type="button" className="live-control stop" disabled={!canStop} onClick={() => void e.act('stop')}>
            <span><Square size={23} fill="currentColor" /></span><b>{s.phase === 'stopping' ? 'Arrêt demandé' : 'Arrêter'}</b>
          </button>
        </div>}
      </div>
    </div>}
  </div>
}
