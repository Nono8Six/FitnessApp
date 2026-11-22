import { Bluetooth, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight, List, SlidersHorizontal, Minus, Pause, Play, Plus, Square, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { nearest, ProgrammeMini, TimeChart, usePlotHeight, type Series } from '../components/charts'
import { Button, cx, Disclosure, Facts, Group, Segmented, Sheet } from '../components/ui'
import { calories, clock, dec1, dec2 } from '../lib/format'
import { currentMeasurement, inProgress, phaseLabel, prepareExecution, useExecution, type LiveSample, type Preparation, type Session } from '../lib/execution'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { useCurrentProfile } from '../lib/profiles'
import type { Workout } from '../lib/workouts'
import type { Block } from '../lib/types'
import { BlockReadings, CourseChart, CourseData, CourseReadout, NextBlock } from './CourseView'

export function StartButton({ profile, workout, className }: { profile: string; workout: Workout; className?: string }) {
  const e = useExecution()
  return <Button className={className} onClick={() => e.select(profile, workout)}>{inProgress(e.feed?.session.phase) ? 'Revenir au Direct' : 'Commencer'}</Button>
}

function Confirmations({ keyReady, clear, setKey, setClear }: { keyReady: boolean; clear: boolean; setKey: (v: boolean) => void; setClear: (v: boolean) => void }) {
  return <Group className="course-confirmations">
    {[{ label: 'Clé de sécurité en place', value: keyReady, change: setKey }, { label: 'Bande libre', value: clear, change: setClear }].map(item =>
      <label key={item.label} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-body [&+&]:shadow-[inset_0_0.5px_0_var(--color-sep)]">
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
    <div className="course-confirm">
      <p className="truncate text-headline">{resume ? s?.workout?.name : e.selected?.workout.name}</p>
      <p className="mt-1 text-subhead text-label-2">{resume ? `${s?.profile?.name} · reprise à ${clock(Math.floor(s?.active_s ?? 0))}` : `${prepared?.profile.name ?? ''} · ${clock(e.selected?.workout.summary.sec ?? 0)}`}</p>
      {!resume && !!prepared?.cooldown_s && <p className="mt-1 text-footnote text-label-2">Puis {clock(prepared.cooldown_s)} de retour au calme avant l’arrêt.</p>}
      {!resume && <div className="mt-1 flex min-h-8 items-center gap-2 text-subhead">
        <Bluetooth size={20} className={connected ? 'text-green' : 'text-label-2'} />
        <span className="flex-1">{e.feed?.device.device_name ?? 'Tapis non connecté'}</span>
        {checking ? <span role="status" className="text-label-2">Vérification…</span> : connected && <Check size={18} className="text-green" />}
      </div>}
      {message && <p role="alert" className="mt-2 rounded-[12px] bg-orange/15 px-4 py-3 text-subhead text-orange">{message}</p>}
      {!live && <p role="alert" className="mt-2 text-subhead text-orange">{e.status === 'loading' ? 'Connexion au PC en cours…' : 'Contact avec le PC perdu. Reconnexion en cours…'}</p>}
      {(!ready && !checking) && <div className="mt-3 flex gap-2">
        <Button variant="gray" size="md" onClick={settings}>Réglages du tapis</Button>
        {!resume && <Button variant="plain" size="md" disabled={checking} onClick={() => setRevision(v => v + 1)}>Revérifier</Button>}
      </div>}
      <Confirmations keyReady={keyReady} clear={clear} setKey={setKey} setClear={setClear} />
      {!resume && <Disclosure title="Tapis et limites" className="mt-2"><Facts rows={[
        ['Pilotage', 'Gardez le PC allumé et connecté au tapis.'],
        ['Vitesse maximale', limits ? `${dec1(limits.speed)} km/h` : 'En cours de vérification'],
        ['Pente maximale', limits ? `${dec1(limits.incline)} %` : 'En cours de vérification'],
        ['Mode', mode === 'simulation' ? 'Simulation' : mode === 'reel' ? 'RUN500 réel' : 'En cours de vérification'],
      ]} /></Disclosure>}
    </div>
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
    <a href={href.direct} className="pressable min-w-0 flex-1 py-2 pl-4">
      <span className="text-subhead font-semibold text-accent">Revenir au Direct</span>
      <p className="truncate text-footnote text-label-2">
        <span aria-hidden className={cx('mr-1.5 inline-block size-1.5 rounded-full align-middle', !live ? 'bg-orange' : paused ? 'bg-yellow' : s.phase === 'unknown' ? 'bg-red' : 'bg-green')} />
        {live ? phaseLabel[s.phase] : 'Hors ligne'} · {block.label}
      </p>
      <p className="num truncate text-footnote text-label-2">
        <span className="text-time">{clock(Math.floor(s.active_s))}</span> · <span className={speed === null ? 'text-label-3' : 'text-speed'}>{speed === null ? '--' : dec1(speed)}</span> km/h
        {s.mode === 'simulation' && <span className="text-orange"> · Simulation</span>}
      </p>
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
  const [plot, height] = usePlotHeight()
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
    { key: 'incline', data: samples, value: p => p.incline, color: 'var(--color-incline)', width: 2.5, step: true, maxGap: 2, axis: 'secondary' },
  ], [samples])
  const stamp = selected && startedAt ? new Date(new Date(startedAt).getTime() + selected.t * 1000).toLocaleTimeString('fr-FR') : ''
  return <section className="live-curves" aria-label="Courbes de la séance">
    <div className="history-controls">
      <div className="history-legend"><span>Vitesse <small>km/h</small></span><span>Pente <small>%</small></span></div>
      <div role="group" aria-label="Fenêtre des courbes">
        {[{ v: 60, label: '1 min' }, { v: 300, label: '5 min' }, { v: 0, label: 'Séance' }].map(option => <button key={option.v} type="button" aria-pressed={windowS === option.v}
          onClick={() => { setWindowS(option.v); setCursor(null) }}>{option.label}</button>)}
      </div>
    </div>
    <div className="history-reading">
      <p className="num">{cursor === null ? 'Cible de vitesse en pointillés'
        : selected ? `${stamp} · ${selected.speed === null ? '—' : dec1(selected.speed)} km/h · ${selected.incline === null ? '—' : dec1(selected.incline)} % · cible ${dec1(selected.target)} km/h`
        : `${clock(cursor)} · sans mesure`}</p>
      {cursor !== null && <button type="button" aria-label="Effacer la sélection" onClick={() => setCursor(null)}><X size={16} /></button>}
    </div>
    <div ref={plot} className="history-plot">{height > 40 && <TimeChart series={[...speedSeries, ...inclineSeries]} x0={x0} x1={x1} y0={0}
      y1={Math.max(4, ...samples.map(p => Math.max(p.speed ?? 0, p.target)))} secondary={{ y0: 0, y1: Math.max(2, ...samples.map(p => Math.ceil((p.incline ?? 0) / 2) * 2)), unit: '%', color: 'var(--color-incline)' }}
      height={height} unit="km/h" label="Historique de vitesse et de pente" gaps={gaps} markers={markers} cursor={cursor} onCursor={setCursor} live={live} />}</div>
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

function PageSteps({ index, total, select, label }: { index: number; total: number; select: (i: number) => void; label: string }) {
  return <div className="course-page-steps" role="group" aria-label={label}>
    <button type="button" disabled={index <= 0} aria-label="Précédent" onClick={() => select(index - 1)}><ChevronLeft size={20} /></button>
    <span className="num">{index + 1} / {total}</span>
    <button type="button" disabled={index >= total - 1} aria-label="Suivant" onClick={() => select(index + 1)}><ChevronRight size={20} /></button>
  </div>
}

function WorkoutProgram({ s, blocks }: { s: Session; blocks: Block[] }) {
  const [index, setIndex] = useState(s.block_index)
  const block = blocks[index]
  return <div className="course-tool-page">
    <PageSteps label="Parcourir les blocs" index={index} total={blocks.length} select={setIndex} />
    <h2 className="text-title3">{block.label}</h2>
    <p className="num text-subhead text-label-2">{clock(block.sec)} · {dec1(block.speed)} km/h · {dec1(block.incline)} %</p>
    <Progress blocks={blocks} active={s.active_s} />
  </div>
}

function DeviceDetails({ s }: { s: Session }) {
  const e = useExecution()
  const [page, setPage] = useState(0)
  const facts: ReadonlyArray<readonly [string, string]> = [
    ['Profil', `${s.profile?.name} · Version ${s.workout?.version}`],
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
  ]
  const perPage = 2
  return <div className="course-tool-page">
    <PageSteps label="Informations du tapis" index={page} total={Math.ceil(facts.length / perPage)} select={setPage} />
    <Facts rows={facts.slice(page * perPage, (page + 1) * perPage)} />
    {page === 0 && s.owned_by_me && inProgress(s.phase) && e.screenAwake.status !== 'active' && <button type="button" className="min-h-11 text-subhead text-orange" disabled={e.screenAwake.status === 'requesting'} onClick={() => void e.screenAwake.request()}>Activer l’anti-veille</button>}
  </div>
}

export function Direct() {
  const e = useExecution(), s = e.feed?.session, profile = useCurrentProfile()
  const [view, setView] = useState<'graph' | 'data'>('graph')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [tool, setTool] = useState<'adjust' | 'program' | 'history' | 'device'>('adjust')
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const speed = currentMeasurement(e, 'speed_kmh'), incline = currentMeasurement(e, 'incline_pct')
  const available = e.status === 'live' && (e.now - e.receivedAt) < 5000
  const blocks = useMemo(() => s?.workout?.blocks.map((b, i) => ({ ...b, ...s.targets[i] })) ?? [], [s?.workout, s?.targets])
  const block = blocks[s?.block_index ?? 0], next = blocks[(s?.block_index ?? 0) + 1]
  const finished = s && ['stopped', 'completed', 'cancelled'].includes(s.phase)
  useEffect(() => {
    if (finished && s.id && s.recording?.status === 'saved' && s.profile?.id === profile?.id && e.status === 'live') navigate(href.report(s.id))
  }, [finished, s?.id, s?.recording?.status, s?.profile?.id, profile?.id, e.status])
  const paused = s?.phase === 'paused'
  const statusTone = !available ? 'text-orange' : s?.phase === 'unknown' ? 'text-red' : paused ? 'text-yellow' : 'text-green'
  if (!s || !s.workout || !s.id) return <div className="live-screen"><div className="live-empty">
    <h1 className="text-title1">Direct</h1><p className="mt-3 text-label-2" role="status">{e.status === 'loading' ? 'Chargement de la séance…' : e.status === 'offline' ? 'État de séance indisponible. Attendez la reconnexion au PC.' : 'Aucune séance en cours'}</p>
    <Button className="mt-6" onClick={() => navigate(href.today)}>Aujourd’hui</Button>
  </div></div>
  const error = !available ? 'PC déconnecté. État du tapis inconnu. Utilisez le STOP physique si nécessaire.'
    : s.phase === 'unknown' ? s.error ?? 'État de la bande inconnu. Utilisez le STOP physique, puis reconnectez.'
    : e.error ?? s.error ?? (speed === null || incline === null ? 'Mesures du tapis indisponibles.' : undefined)
  const interrupted = !available || s.phase === 'unknown'
  const canPause = available && ['running', 'transitioning', 'adjusting'].includes(s.phase)
  const canResume = available && paused && (s.can_resume ?? s.owned_by_me) && s.restart_delay_s === 0 && speed === 0
  const kcal = calories(s.totals.energy)
  const distance = available && (s.distance_quality === 'fresh' || s.distance_quality === 'partial') && s.distance_m !== null ? dec2(s.distance_m / 1000) : '—'
  const duration = available ? clock(Math.floor(s.active_s)) : '—'
  const elapsed = block ? Math.max(0, Math.min(block.sec, s.active_s - block.start)) : 0
  const blockReadings = <BlockReadings speed={speed} remaining={available && block ? clock(Math.ceil(block.sec - elapsed)) : '—'} />
  const sessionReadings = <>
    <div><dt>Durée active</dt><dd className="num text-time" data-long={duration.length > 5 || undefined}>{duration}</dd></div>
    <div><dt>Distance{s.distance_quality === 'partial' && ' partielle'}</dt><dd className="num text-distance" data-long={distance.length > 5 || undefined}>{distance}<small>km</small></dd></div>
  </>
  const canStop = available && !finished && s.phase !== 'unknown' && s.phase !== 'stopping' && e.pending !== 'stop'
  return <div className="live-screen">
    <header className="live-header">
      <a href={href.today} className="pressable live-home"><ChevronDown size={18} aria-hidden />Accueil</a>
      <div className="live-heading"><h1>{s.workout.name}</h1>
        <p role="status" className={cx('live-status', statusTone)}><span />{available ? phaseLabel[s.phase] : 'Hors ligne'}</p>
      </div>
      {s.mode === 'simulation' && <span className="live-mode">Simulation</span>}
    </header>
    {s.phase === 'countdown' ? <div className="live-countdown">
      <strong key={s.countdown} className="num animate-pop" aria-label={`Départ dans ${s.countdown} secondes`}>{s.countdown}</strong>
      <p className="text-subhead text-label-2">{block?.label} · cible {dec1(block?.speed ?? 0)} km/h</p>
      <Button variant="gray" className="mt-8 min-w-48" disabled={!canStop} onClick={() => void e.act('stop')}>Annuler le démarrage</Button>
      {e.error && <p role="alert" className="mt-4 text-red">{e.error}</p>}
    </div> : <div className="live-layout">
      {interrupted ? null : toolsOpen ? <section className="course-tools" aria-label="Réglages de course">
        <Segmented variant="course" label="Outils de course" value={tool} onChange={setTool} options={[
          { value: 'adjust', label: 'Ajuster' }, { value: 'program', label: 'Blocs' },
          { value: 'history', label: 'Historique' }, { value: 'device', label: 'Tapis' },
        ]} />
        <div className="course-tool-content" key={tool}>
          {tool === 'adjust' ? <LiveAdjustments /> : tool === 'program' ? <WorkoutProgram s={s} blocks={blocks} />
            : tool === 'device' ? <DeviceDetails s={s} />
            : <LiveCurves samples={e.feed!.samples} markers={e.feed!.markers} wall={s.wall_s} startedAt={s.started_at} live={available && canPause} />}
        </div>
      </section> : <section className="course-dashboard" data-view={view} aria-label="Mesures de la séance">
        <CourseReadout block={block} index={s.block_index} count={blocks.length} elapsed={elapsed}>
          {view === 'data' ? sessionReadings : blockReadings}
        </CourseReadout>
        <Segmented variant="course" className="course-view-toggle" label="Affichage du Direct" value={view} onChange={setView} options={[
          { value: 'graph', label: 'Graphique', icon: <ChartNoAxesCombined size={16} /> },
          { value: 'data', label: 'Données', icon: <List size={16} /> },
        ]} />
        {view === 'graph' ? <CourseChart session={s} samples={e.feed!.samples} blocks={blocks} available={available} speed={speed} incline={incline} />
          : <CourseData speed={speed} incline={incline} block={block}>{blockReadings}</CourseData>}
        <NextBlock next={next} />
        <dl className="course-totals">
          {view === 'graph' && sessionReadings}
          <div><dt>Kcal estimées</dt><dd className="num text-energy" data-long-value={!!kcal && kcal.length > 7 || undefined}>{available ? kcal ?? '—' : '—'}</dd></div>
          <div><dt>Vitesse moy.</dt><dd className="num text-speed">{available && s.totals.speed_avg !== null ? dec1(s.totals.speed_avg) : '—'}<small>km/h</small></dd></div>
        </dl>
      </section>}
      <div className={cx('live-controls-wrap', interrupted && 'is-interrupted')} role="region" aria-label="Commandes de la séance">
        <div className="live-control-messages">
          {error && <p role="alert" className={cx('live-notice', s.phase === 'unknown' && 'is-urgent')}>{error}</p>}
          {s.recording && s.recording.status === 'error' && <p role="alert" className="mb-3 text-footnote text-red">
            {`${s.recording.error ?? 'Enregistrement interrompu.'} Données conservées jusqu’à ${clock(s.recording.persisted_s)} depuis le départ.`}
          </p>}
          {finished && s.recording?.status === 'error' && <a href={href.report(s.id)} className="pressable mb-3 flex min-h-11 items-center text-subhead text-accent">Consulter les données conservées</a>}
          {s.can_claim && <Button variant="gray" className="course-claim mb-3 w-full" aria-label="Reprendre le contrôle sur cet écran" disabled={!available || !!e.pending} onClick={() => void e.act('claim')}>Reprendre le contrôle</Button>}
          {paused && s.reason && s.reason !== 'Pause demandée' && <p role="status" className="mb-2 text-footnote text-yellow">{s.reason}</p>}
          {paused && (!(s.can_resume ?? s.owned_by_me) || s.restart_delay_s > 0) && <p className="live-action-hint text-label-2">{!(s.can_resume ?? s.owned_by_me) ? 'Reprise depuis l’écran de départ' : `Stabilisation · ${s.restart_delay_s} s`}</p>}
          {s.phase === 'unknown' && <Button variant="plain" className="mb-2 w-full" onClick={() => navigate(href.treadmill)}>Reconnecter dans Réglages</Button>}
          {s.phase === 'unknown' && e.feed?.device.read_only && e.feed.device.phase === 'connected' && speed === 0 && <Button variant="gray" className="mb-3 w-full" onClick={() => void e.act('recover')}>Clore la séance interrompue</Button>}
        </div>
        {finished ? <div className="live-finish">
          <p role="status" className="text-subhead text-green">{s.stop_confirmed ? 'Arrêt confirmé · 0,0 km/h' : s.phase === 'cancelled' ? 'Aucun mouvement demandé' : s.reason}</p>
        </div> : <div className="live-controls">
          <button type="button" className={cx('live-control', paused ? 'resume' : 'pause')} disabled={!(paused ? canResume && !e.pending : canPause)}
            onClick={() => paused ? e.setConfirmingResume(true) : void e.act('pause')}>
            <span>{paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}</span><b>{paused ? 'Reprendre' : 'Pause'}</b>
          </button>
          <button type="button" className="live-control stop" disabled={!canStop} onClick={() => void e.act('stop')}>
            <span><Square size={23} fill="currentColor" /></span><b>{s.phase === 'stopping' || e.pending === 'stop' ? 'Arrêt demandé' : 'Terminer'}</b>
          </button>
          <button type="button" className="live-control tools" aria-label={toolsOpen ? 'Revenir au Direct' : 'Ajuster et consulter la séance'} aria-pressed={toolsOpen && !interrupted} disabled={interrupted}
            onClick={() => setToolsOpen(v => !v)}>{toolsOpen && !interrupted ? <X size={22} /> : <SlidersHorizontal size={22} />}</button>
        </div>}
      </div>
    </div>}
  </div>
}
