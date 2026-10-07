import { Bluetooth, Check, ChevronDown, Minus, Pause, Play, Plus, Square, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { nearest, ProgrammeMini, TimeChart, type Series } from '../components/charts'
import { Button, cx, Disclosure, Facts, Group, Sheet } from '../components/ui'
import { clock, dec1, dec2, pace } from '../lib/format'
import { currentMeasurement, inProgress, phaseLabel, prepareExecution, useExecution, type LiveSample, type Preparation } from '../lib/execution'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { useCurrentProfile } from '../lib/profiles'
import type { Workout } from '../lib/workouts'
import type { Block } from '../lib/types'

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
  const ready = resume ? s?.phase === 'paused' && s.owned_by_me && s.restart_delay_s === 0 && currentMeasurement(e, 'speed_kmh') === 0
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
    <p className="mt-4 px-1 text-footnote text-label-2">Gardez cet écran ouvert. Si le téléphone suspend la page, le PC demandera l’arrêt après 12 s sans contact.</p>
    <Disclosure title="Périmètre de la séance" className="mt-4"><Facts rows={[
      ['Vitesse maximale', limits ? `${dec1(limits.speed)} km/h` : 'En cours de vérification'],
      ['Pente maximale', limits ? `${dec1(limits.incline)} %` : 'En cours de vérification'],
      ['Mode', mode === 'simulation' ? 'Simulation' : mode === 'reel' ? 'RUN500 réel' : 'En cours de vérification'],
      ['Présence', 'Nouvelle confirmation à chaque reprise'],
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
    <button type="button" disabled={!(paused ? s.owned_by_me && live && !e.pending : canPause)}
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
  const selected = cursor === null ? undefined : nearest(samples, cursor)
  const gaps = useMemo(() => {
    const ranges: [number, number][] = []
    let start: number | undefined
    for (const p of samples) {
      if (p.speed === null || p.incline === null) start ??= p.t
      else if (start !== undefined) { ranges.push([start, p.t]); start = undefined }
    }
    if (start !== undefined) ranges.push([start, wall])
    return ranges
  }, [samples, wall])
  const speedSeries: Series[] = useMemo(() => [
    { key: 'speed', data: samples, value: p => p.speed, color: 'var(--color-speed)', width: 2.5, area: true },
    { key: 'target', data: samples, value: p => p.target, color: 'rgb(255 255 255 / .6)', dash: '4 4', step: true },
  ], [samples])
  const inclineSeries: Series[] = useMemo(() => [
    { key: 'incline', data: samples, value: p => p.incline, color: 'var(--color-incline)', width: 2, step: true },
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
        <p className="num text-footnote text-label-2">{selected ? `Lecture à ${stamp} · ${clock(selected.t)} depuis le départ` : 'Mesures reçues · cible en pointillés'}</p>
        <p className="num mt-1 flex flex-wrap gap-x-4 text-subhead">
          <span className="text-speed">{selected ? selected.speed === null ? '--' : dec1(selected.speed) : 'Vitesse'}{selected && ' km/h'}</span>
          <span className="text-label-2">{selected ? `Cible ${dec1(selected.target)} km/h` : 'Cible'}</span>
          <span className="text-incline">{selected ? selected.incline === null ? '--' : `${dec1(selected.incline)} %` : 'Pente'}</span>
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
  const enabled = s.owned_by_me && s.phase === 'running' && !e.pending && e.status === 'live'
    && e.now - e.receivedAt < 5000 && currentMeasurement(e, 'speed_kmh') !== null && currentMeasurement(e, 'incline_pct') !== null
  const target = s.targets[s.block_index]
  const signed = (v: number) => `${v > 0 ? '+' : ''}${dec1(v)}`
  const adjusted = s.offsets.speed !== 0 || s.offsets.incline !== 0
  const offsetLabel = [s.offsets.speed ? `${signed(s.offsets.speed)} km/h` : '', s.offsets.incline ? `${signed(s.offsets.incline)} %` : ''].filter(Boolean).join(' · ')
  const limited = (['speed', 'incline'] as const).filter(action => s.adjustment_bounds && s.offsets[action] + s.adjustment_bounds[action].step > s.adjustment_bounds[action].max + 1e-6)
  const limitHint = limited.length === 2 ? 'Limites atteintes dans les blocs restants' : limited.length ? `Un bloc restant limite la ${limited[0] === 'speed' ? 'vitesse' : 'pente'}` : undefined
  return <div className="live-adjustments" role="group" aria-label="Consignes pour le reste de la séance">
    {(['speed', 'incline'] as const).map(action => {
      const label = action === 'speed' ? 'Vitesse' : 'Pente', unit = action === 'speed' ? 'km/h' : '%'
      const range = s.adjustment_bounds?.[action]
      const change = (direction: number) => {
        if (!range) return
        const offsets = { ...s.offsets, [action]: Math.round((s.offsets[action] + direction * range.step) * 1e6) / 1e6 }
        void e.act('adjust', false, offsets)
      }
      return <div className="live-adjust-row" key={action}>
        <span className="text-subhead text-label-2">{label}</span>
        <div className="live-adjust-stepper">
          <button type="button" aria-label={`Diminuer la ${label.toLowerCase()} pour le reste de la séance`} disabled={!enabled || !range || s.offsets[action] - range.step < range.min - 1e-6} onClick={() => change(-1)}><Minus size={20} /></button>
          <span className={cx('live-adjust-value num', action === 'speed' ? 'text-speed' : 'text-incline')}>{dec1(target[action])}<small>{unit}</small></span>
          <button type="button" aria-label={`Augmenter la ${label.toLowerCase()} pour le reste de la séance`} disabled={!enabled || !range || s.offsets[action] + range.step > range.max + 1e-6} onClick={() => change(1)}><Plus size={20} /></button>
        </div>
      </div>
    })}
    <p className="live-adjust-hint" role="status">{s.phase === 'adjusting' ? 'Consignes envoyées · effet attendu' : !s.owned_by_me && inProgress(s.phase) ? 'Réglages sur l’écran qui a démarré la séance'
      : adjusted ? `Blocs restants : ${offsetLabel}` : limitHint ?? 'Les réglages s’appliquent aux blocs restants'}</p>
  </div>
}

export function Direct() {
  const e = useExecution(), s = e.feed?.session, profile = useCurrentProfile()
  const [showPace, setShowPace] = useState(profile?.speed_unit === 'pace')
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
  const error = !available ? 'Observation interrompue. Le PC surveille l’écran propriétaire ; l’état de la bande reste à vérifier.'
    : s.phase === 'unknown' ? s.error ?? 'État de la bande inconnu. Utilisez le STOP physique, puis reconnectez.'
    : e.error ?? s.error ?? (speed === null || incline === null ? 'Mesures anciennes ou absentes. Les valeurs actuelles sont indisponibles.' : undefined)
  const canPause = available && ['running', 'transitioning', 'adjusting'].includes(s.phase)
  const canResume = available && paused && s.owned_by_me && s.restart_delay_s === 0 && speed === 0
  const canStop = available && !finished && s.phase !== 'unknown' && s.phase !== 'stopping'
  return <div className="live-screen">
    <header className="live-header">
      <button type="button" aria-label="Réduire le Direct" onClick={reduce} className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-fill-3"><ChevronDown size={25} /></button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-headline">{s.workout.name}</h1><p className="truncate text-footnote text-label-2">{s.profile?.name} · Version {s.workout.version}</p></div>
      {s.mode === 'simulation' && <span className="live-mode">Simulation</span>}
    </header>
    {s.phase === 'countdown' ? <div className="live-countdown">
      <p className="text-title3">Prêt à démarrer</p><strong key={s.countdown} className="num animate-pop">{s.countdown}</strong>
      <p className="text-subhead text-label-2">{block?.label} · cible {dec1(block?.speed ?? 0)} km/h</p>
      <Button variant="gray" className="mt-8 min-w-48" onClick={() => void e.act('stop')}>Annuler le démarrage</Button>
      {e.error && <p role="alert" className="mt-4 text-red">{e.error}</p>}
    </div> : <div className="live-layout">
      <section className="live-primary" aria-label="Mesures et commandes actuelles">
        <div className="live-glance">
          <p role="status" className={cx('live-status', statusTone)}><span className="size-2 rounded-full bg-current" />{available ? phaseLabel[s.phase] : 'Observation interrompue'}</p>
          <button type="button" className={cx('live-speed num', showPace && 'is-pace')} onClick={() => setShowPace(v => !v)} aria-label={showPace ? 'Afficher la vitesse en km/h' : 'Afficher l’allure par kilomètre'}>
            <span className={cx('live-speed-value', speed === null || (showPace && speed === 0) ? 'text-label-3' : 'text-speed')}>{speed === null ? '--' : showPace ? pace(speed) : dec1(speed)}</span>
            <span className="live-speed-unit text-label-2">{showPace ? '/ KM' : 'KM/H'}</span>
          </button>
          <p className="live-measure-label">{showPace ? 'Allure mesurée' : 'Vitesse mesurée'}</p>
          <div className="live-duration"><strong className="num text-time">{clock(Math.floor(s.active_s))}</strong><span className="text-footnote text-label-2">Durée active{!available && ' · dernière reçue'}</span></div>
          <div className="live-secondary">
            <div><span className="text-footnote text-label-2">Distance{ s.distance_quality === 'partial' ? ' · partielle' : ''}</span><p className={cx('num', available && ['fresh','partial'].includes(s.distance_quality) ? 'text-distance' : 'text-label-3')}>{available && ['fresh','partial'].includes(s.distance_quality) && s.distance_m !== null ? dec2(s.distance_m / 1000) : '--'}<small>KM</small></p></div>
            <div><span className="text-footnote text-label-2">Pente mesurée</span><p className={cx('num', incline === null ? 'text-label-3' : 'text-incline')}>{incline === null ? '--' : dec1(incline)}<small>%</small></p></div>
            <div><span className="text-footnote text-label-2">Calories actives</span><p className={cx('num', available && s.totals.energy.active_kcal !== null ? 'text-energy' : 'text-label-3')}>{available && s.totals.energy.active_kcal !== null ? `≈ ${Math.round(s.totals.energy.active_kcal)}` : '--'}<small>KCAL</small></p></div>
            <div><span className="text-footnote text-label-2">Vitesse moyenne</span><p className={cx('num', available && s.totals.speed_avg !== null ? 'text-speed' : 'text-label-3')}>{available && s.totals.speed_avg !== null ? dec1(s.totals.speed_avg) : '--'}<small>KM/H</small></p></div>
          </div>
          {available && ((s.totals.coverage.speed !== null && s.totals.coverage.speed < .99) || (s.totals.coverage.energy !== null && s.totals.coverage.energy < .99)) && <p className="mt-1 text-caption text-orange">Moyenne et estimation sur les mesures disponibles</p>}
        </div>
        <div className="live-controls-wrap">
          {error && <p role="alert" className={cx('live-notice', s.phase === 'unknown' && 'is-urgent')}>{error}</p>}
          {s.recording && <p role={s.recording.status === 'error' ? 'alert' : 'status'} className={cx('mb-3 text-footnote', s.recording.status === 'error' ? 'text-red' : 'text-label-2')}>
            {s.recording.status === 'error' ? `${s.recording.error} Données conservées jusqu’à ${clock(s.recording.persisted_s)} depuis le départ.` : s.recording.status === 'saved' ? 'Enregistré' : `Enregistrement · conservé jusqu’à ${clock(s.recording.persisted_s)}`}
          </p>}
          {finished && s.recording?.status === 'error' && <a href={href.report(s.id)} className="pressable mb-3 flex min-h-11 items-center text-subhead text-accent">Consulter les données conservées</a>}
          {paused && <p className="live-action-hint text-label-2">{!s.owned_by_me ? 'Reprise sur l’écran qui a démarré la séance' : s.restart_delay_s ? `Stabilisation · ${s.restart_delay_s} s` : `Point conservé · pause ${clock(Math.floor(s.pause_s))}`}</p>}
          {s.phase === 'unknown' && <Button variant="plain" className="mb-2 w-full" onClick={() => navigate(href.treadmill)}>Reconnecter dans Réglages</Button>}
          {s.phase === 'unknown' && e.feed?.device.read_only && e.feed.device.phase === 'connected' && speed === 0 && <Button variant="gray" className="mb-3 w-full" onClick={() => void e.act('recover')}>Clore la séance interrompue</Button>}
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
      </section>
      <div className="live-detail">
        <section className="live-block" aria-label="Bloc et consignes">
          <div className="flex items-baseline justify-between gap-3"><p className="text-footnote text-label-2">Bloc {(s.block_index + 1)} / {s.workout.blocks.length}</p><span className="num text-footnote text-time">{clock(Math.ceil(Math.max(0, (block?.end ?? 0) - s.active_s)))} restantes</span></div>
          <h2 className="mt-1.5 text-title1">{block?.label}</h2>
          <LiveAdjustments />
          <div className="live-block-progress" role="progressbar" aria-label="Progression du bloc" aria-valuemin={0} aria-valuemax={block?.sec ?? 1} aria-valuenow={Math.round(Math.max(0, Math.min(block?.sec ?? 0, s.active_s - (block?.start ?? 0))))}><span style={{width: `${Math.max(0, Math.min(100, (s.active_s - (block?.start ?? 0)) / (block?.sec ?? 1) * 100))}%`}} /></div>
          <p className="live-next text-subhead text-label-2">{next ? <>Ensuite <span className="text-label">{next.label}</span> · {dec1(next.speed)} km/h · {dec1(next.incline)} % · {clock(next.sec)}</> : 'Ensuite · fin du programme et arrêt demandé'}</p>
        </section>
        <section className="live-programme" aria-label="Progression du programme"><div className="mb-2 flex justify-between gap-2 text-footnote text-label-2"><span>Programme</span><span className="num">{clock(Math.floor(s.active_s))} / {clock(total)}</span></div><Progress blocks={blocks} active={s.active_s} /></section>
        <LiveCurves samples={e.feed?.samples ?? []} markers={e.feed?.markers ?? []} wall={s.wall_s} startedAt={s.started_at} live={available && canPause} />
        <Disclosure title="État du tapis et des mesures" className="mt-5">
          <Facts rows={[
            ['Écran', s.owned_by_me ? 'Propriétaire' : 'Observation · arrêt et pause accessibles'],
            ['Tapis', e.feed?.device.phase === 'connected' ? 'Connecté' : 'Déconnecté · bande inconnue'],
            ['Commande', s.command ? `${s.command.status === 'sent' ? 'Envoyée' : s.command.status === 'accepted' ? 'Acceptée · effet attendu' : s.command.status === 'observed' ? 'Effet observé' : s.command.status === 'unknown' ? 'Résultat inconnu' : 'Refusée'}` : 'Aucune'],
            ['Pause cumulée', clock(Math.floor(s.pause_s))],
            ['Calories actives', 'Estimation ACSM · poids figé au départ'],
            ['Couverture calories', s.totals.coverage.energy === null ? '--' : `${Math.round(s.totals.coverage.energy * 100)} % du temps actif`],
            ['Couverture vitesse moyenne', s.totals.coverage.speed === null ? '--' : `${Math.round(s.totals.coverage.speed * 100)} % du temps actif`],
            ['Limite du calcul', s.totals.energy.outside_range ? 'Vitesse hors des plages usuelles ACSM · estimation moins sûre' : 'Calories estimées, pas une mesure physiologique'],
            ['Autorisation restante', clock(s.authorization_remaining_s)],
            ...(['speed_kmh', 'incline_pct'] as const).map(key => {
              const m = e.feed!.device.measurements[key]
              const age = m.age_s === null ? null : Math.ceil(m.age_s + Math.max(0, (e.now - e.receivedAt) / 1000))
              return [key === 'speed_kmh' ? 'Dernière vitesse' : 'Dernière pente', m.value === null ? 'Non reçue' : `${dec1(m.value)} ${key === 'speed_kmh' ? 'km/h' : '%'} · il y a ${age ?? '--'} s`] as const
            }),
          ]} />
        </Disclosure>
      </div>
    </div>}
  </div>
}
