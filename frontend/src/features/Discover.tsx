import { ChevronDown, Flame, Gauge, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Chip, ChipRow, ControlRow, Disclosure, Group, Menu, pillClass, Segmented, Sheet, Stepper } from '../components/ui'
import { WorkoutCard } from '../components/WorkoutCard'
import { WorkoutBlocks } from '../components/WorkoutBlocks'
import { WeightLink, WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { clock } from '../lib/format'
import {
  addCatalog, GOAL_SHORT, GOALS, LEVELS, previewCatalog,
  type CatalogMethod, type CatalogOption, type CatalogTarget, type Goal, type Level, type LoadState,
} from '../lib/workouts'

type Mode = 'duration' | 'calories'
const LIMITS = { duration: { min: 15, max: 60, step: 5, unit: 'min' }, calories: { min: 1, max: 5000, step: 25, unit: 'kcal' } } as const
const LEVEL_OPTIONS = (Object.entries(LEVELS) as [Level, string][]).map(([value, label]) => ({ value, label }))

/** Cible exclusive durée ou calories actives, avec le même réglage sur la page et dans l'aperçu. */
function TargetRows({ mode, value, disabled, onMode, onValue, children }: {
  mode: Mode; value: number; disabled: boolean
  onMode: (v: Mode) => void; onValue: (v: number) => void; children?: ReactNode
}) {
  const [error, setError] = useState<string>()
  const limits = LIMITS[mode]
  return <Group footer={error ? undefined : mode === 'duration'
    ? 'Échauffement et retour au calme compris.'
    : 'Prévision selon votre poids. La durée s’adapte, jusqu’à 60 min.'}>
    <div className="g-row px-4 py-2.5">
      <Segmented label="Cible de la séance" value={mode} disabled={disabled} onChange={v => { setError(undefined); onMode(v) }}
        options={[{ value: 'duration', label: 'Durée' }, { value: 'calories', label: 'Calories' }]} />
    </div>
    <ControlRow title={mode === 'duration' ? 'Durée' : 'Kcal actives'} error={error}
      control={<Stepper key={mode} value={value} min={limits.min} max={limits.max} step={limits.step} unit={limits.unit}
        color={mode === 'duration' ? 'var(--color-time)' : 'var(--color-energy)'}
        label={mode === 'duration' ? 'Durée souhaitée en minutes' : 'Objectif de calories actives'}
        disabled={disabled} onChange={onValue} onInvalid={setError} />} />
    {children}
  </Group>
}

/** Répartition réelle de l'effort, d'après le serveur : barre proportionnelle et durées. */
function EffortBreakdown({ dose, total }: { dose: NonNullable<CatalogMethod['dose']>; total: number }) {
  const parts = [
    { label: 'Travail ciblé', sec: dose.work_sec, color: 'var(--color-accent)' },
    { label: 'Récupération', sec: dose.recovery_sec, color: '#8e8e93' },
    { label: 'Marche facile', sec: dose.easy_sec, color: '#636366' },
    { label: 'Mise en route et fin', sec: total - dose.work_sec - dose.recovery_sec - dose.easy_sec, color: '#48484a' },
  ].filter(p => p.sec > 0)
  return <section aria-labelledby="effort-title" className="group-bg rounded-[12px] bg-surface px-4 pt-3.5 pb-2">
    <div className="flex items-baseline justify-between gap-3">
      <h3 id="effort-title" className="text-headline">Répartition de l’effort</h3>
      {dose.cycles > 0 && <span className="num text-footnote text-label-2">{dose.cycles} passages</span>}
    </div>
    <div aria-hidden className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
      {parts.map(p => <span key={p.label} style={{ flexGrow: p.sec, background: p.color }} />)}
    </div>
    <dl className="mt-2">
      {parts.map(p => <div key={p.label} className="flex min-h-9 items-center gap-2.5 text-subhead">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
        <dt className="flex-1 text-label-2">{p.label}</dt>
        <dd className="num font-semibold">{clock(p.sec)}</dd>
      </div>)}
    </dl>
    <p className="pb-1.5 text-footnote text-label-3">Plafond de travail : {clock(dose.work_limit_sec)}</p>
  </section>
}

function Method({ method }: { method: CatalogMethod }) {
  return <Disclosure title="Pourquoi ce programme ?" className="mt-5">
    <dl className="px-4 pb-1">
      {([['But', method.purpose], ['Construction', method.structure], ['Adaptation', method.adaptation], ['Effort recherché', method.effort]] as const)
        .map(([label, text]) => <div key={label} className="py-2.5 shadow-[inset_0_0.5px_0_var(--color-sep)]">
          <dt className="text-footnote font-semibold text-label-2 uppercase">{label}</dt>
          <dd className="mt-1 text-subhead">{text}</dd>
        </div>)}
    </dl>
    <p className="mx-4 rounded-[10px] bg-fill-4 px-3 py-2 text-footnote text-label-2">{method.limits}</p>
    <h4 className="mt-4 px-4 text-footnote font-semibold text-label-2 uppercase">Sources</h4>
    <ul className="px-4 pb-2">{method.sources.map(source => <li key={source.url}>
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-subhead text-accent">{source.title}</a>
    </li>)}</ul>
  </Disclosure>
}

export function Discover({ profile }: { profile: string }) {
  const [result, setResult] = useState<{ key: string; state: LoadState<CatalogOption[]> }>()
  const [revision, setRevision] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [template, setTemplate] = useState<{ id: string; name: string } | null>(null)
  const [targetOpen, setTargetOpen] = useState(false)
  const [level, setLevel] = useState<Level>('easy')
  const [mode, setMode] = useState<Mode>('duration')
  const [duration, setDuration] = useState(30)
  const [calories, setCalories] = useState(200)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true), saving = useRef(false)
  const value = mode === 'duration' ? duration : calories
  const target: CatalogTarget = mode === 'duration' ? { duration_sec: value * 60 } : { active_kcal: value }
  const key = JSON.stringify([profile, target, revision])
  const state: LoadState<CatalogOption[]> = result?.key === key ? result.state : { status: 'loading' }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setError('')
    // Les clics rapides sur − / + ne déclenchent qu'un calcul.
    const timer = window.setTimeout(() => {
      const [, request] = JSON.parse(key) as [string, CatalogTarget, number]
      previewCatalog(profile, request).then(data => { if (active) setResult({ key, state: { status: 'ok', data } }) })
        .catch(e => { if (active) setResult({ key, state: { status: 'error', message: errorMessage(e) } }) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [profile, key])
  const options = state.status === 'ok' ? state.data : []
  const missingWeight = mode === 'calories' && options[0]?.weight_kg === null
  const selected = options.find(w => w.template_id === template?.id && w.level === level)
  const shown = selected?.workout
  const groups = goal ? [goal] : Object.keys(GOALS) as Goal[]
  const setValue = mode === 'duration' ? setDuration : setCalories
  const feedback = state.status === 'loading' ? <WorkoutLoading cards={template ? 1 : 2} />
    : state.status === 'error' ? <WorkoutError message={state.message} retry={() => setRevision(v => v + 1)} /> : null
  const add = async () => {
    if (saving.current || !shown) return
    saving.current = true; setBusy(true); setError('')
    try { const saved = await addCatalog(profile, shown, target); if (mounted.current) navigate(href.workout(saved.id)) }
    catch (e) { if (mounted.current) setError(errorMessage(e)) }
    finally { saving.current = false; if (mounted.current) setBusy(false) }
  }
  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => setTargetOpen(true)} aria-label={`Cible : ${value} ${LIMITS[mode].unit}. Modifier`} className={pillClass}>
        {mode === 'duration' ? <Timer size={16} strokeWidth={2.4} className="text-time" /> : <Flame size={16} strokeWidth={2.4} className="text-energy" />}
        <span className="num">{value.toLocaleString('fr-FR')} {LIMITS[mode].unit}</span>
        <ChevronDown size={15} strokeWidth={2.6} className="text-label-2" />
      </button>
      <Menu label={`Difficulté : ${LEVELS[level]}`} align="start" className={pillClass}
        button={<><Gauge size={16} strokeWidth={2.4} className="text-label-2" />{LEVELS[level]}<ChevronDown size={15} strokeWidth={2.6} className="text-label-2" /></>}
        items={LEVEL_OPTIONS.map(o => ({ label: o.label, checked: o.value === level, onSelect: () => setLevel(o.value) }))} />
    </div>
    <ChipRow label="Objectifs du catalogue" className="mb-7">
      <Chip selected={goal === null} onClick={() => setGoal(null)}>Tous</Chip>
      {(Object.keys(GOALS) as Goal[]).map(key => <Chip key={key} selected={goal === key} onClick={() => setGoal(key)}>{GOAL_SHORT[key]}</Chip>)}
    </ChipRow>
    {feedback}
    {missingWeight && <WeightLink className="mb-4" />}
    {!missingWeight && options.length > 0 && groups.map(key => <section key={key} className="mb-9" aria-labelledby={`goal-${key}`}>
      <h2 id={`goal-${key}`} className="mb-3 px-1 text-title2">{GOALS[key]}</h2>
      <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">{options.filter(w => w.goal === key && w.level === level).map(w => <button key={w.template_id} type="button"
        onClick={() => { setTemplate({ id: w.template_id, name: w.name }); setError('') }}
        className="pressable flex min-w-0 flex-col rounded-[22px] bg-surface p-4 text-left desk:p-5 desk:hover:bg-[#232325]">
        {w.workout ? <WorkoutCard data={w.workout} /> : <><h3 className="text-headline">{w.name}</h3><p className="mt-2 text-subhead text-orange">{w.message}</p></>}
        <p className="mt-3 text-footnote text-label-2">{w.description}</p>
      </button>)}</div>
    </section>)}

    <Sheet open={targetOpen} onClose={() => setTargetOpen(false)} title="Cible"
      trailing={<button type="button" onClick={() => setTargetOpen(false)} className="pressable -mr-2 h-11 min-w-11 px-2 text-headline text-accent">OK</button>}>
      <TargetRows mode={mode} value={value} disabled={busy} onMode={setMode} onValue={setValue} />
    </Sheet>

    <Sheet wide open={!!template} onClose={() => { if (!busy) setTemplate(null) }} title={selected?.name ?? template?.name ?? 'Séance'}
      leading={<button type="button" disabled={busy} className="pressable -ml-2 h-11 min-w-11 px-2 text-body text-accent disabled:text-label-3" onClick={() => setTemplate(null)}>Fermer</button>}
      footer={<>
        {error && <p role="alert" className="mb-2 text-subhead text-red">{error}</p>}
        <Button className="w-full" disabled={busy || !shown} onClick={() => void add()}>{busy ? 'Ajout…' : 'Ajouter à mes séances'}</Button>
      </>}>
      {selected && <p className="mb-4 px-1 text-subhead text-label-2">
        <span className="text-label">{GOALS[selected.goal]}</span> · {LEVELS[selected.level]}<br />{selected.description}
      </p>}
      <TargetRows mode={mode} value={value} disabled={busy} onMode={setMode} onValue={setValue}>
        <div className="g-row pl-4">
          <div className="row-sep py-2.5 pr-4">
            <Segmented label="Difficulté du programme" value={level} disabled={busy} onChange={setLevel} options={LEVEL_OPTIONS} />
          </div>
        </div>
      </TargetRows>
      <div className="mt-5">{feedback}</div>
      {selected?.message && <p role="status" className="rounded-[12px] bg-orange/15 px-4 py-3 text-subhead text-orange">{selected.message}</p>}
      {mode === 'calories' && selected?.weight_kg === null && <WeightLink className="mt-3" />}
      {shown && <>
        <WorkoutSummary data={shown} compact />
        {selected?.method.dose && <div className="mt-3"><EffortBreakdown dose={selected.method.dose} total={shown.summary.sec} /></div>}
        <h3 className="mt-7 mb-2 px-1 text-title3">Segments</h3>
        <WorkoutBlocks data={shown} className="" />
      </>}
      {selected && <Method method={selected.method} />}
      {shown && <p className="mt-4 px-1 text-footnote text-label-2">Le niveau décrit ces consignes, pas votre capacité physique. Vous pourrez les modifier.</p>}
    </Sheet>
  </>
}
