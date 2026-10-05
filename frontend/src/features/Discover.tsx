import { useEffect, useRef, useState } from 'react'
import { Button, Segmented, Sheet } from '../components/ui'
import { WorkoutCard, WorkoutLabels } from '../components/WorkoutCard'
import { WorkoutBlocks } from '../components/WorkoutBlocks'
import { WeightLink, WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { addCatalog, GOALS, LEVELS, previewCatalog, type CatalogOption, type CatalogTarget, type Goal, type Level, type LoadState } from '../lib/workouts'

function TargetControls({ mode, duration, calories, disabled, onMode, onDuration, onCalories }: {
  mode: 'duration' | 'calories'; duration: string; calories: string; disabled: boolean
  onMode: (v: 'duration' | 'calories') => void; onDuration: (v: string) => void; onCalories: (v: string) => void
}) {
  const isTime = mode === 'duration'
  return <div className="mb-5">
    <Segmented label="Cible de la séance" value={mode} disabled={disabled} onChange={onMode}
      options={[{ value: 'duration', label: 'Durée' }, { value: 'calories', label: 'Calories' }]} />
    <label className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-[12px] bg-fill-3 px-4 text-body">
      <span>{isTime ? 'Durée souhaitée' : 'Calories actives visées'}</span>
      <span className="flex shrink-0 items-center gap-2">
        <input type="number" inputMode="numeric" min={isTime ? 15 : 1} max={isTime ? 60 : 5000} step="1"
          aria-label={isTime ? 'Durée souhaitée en minutes' : 'Objectif de calories actives'}
          value={isTime ? duration : calories} disabled={disabled}
          onChange={e => (isTime ? onDuration : onCalories)(e.target.value)}
          className="num h-12 w-16 min-w-0 bg-transparent text-right text-title3 text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:text-label-3" />
        <span className="text-subhead text-label-2">{isTime ? 'min' : 'kcal'}</span>
      </span>
    </label>
    <p className="mt-2 px-1 text-footnote text-label-2">{isTime
      ? '15 à 60 min, échauffement et retour au calme compris.'
      : 'Prévision selon votre poids. La durée s’adapte, jusqu’à 60 min.'}</p>
  </div>
}

export function Discover({ profile }: { profile: string }) {
  const [result, setResult] = useState<{ key: string; state: LoadState<CatalogOption[]> }>()
  const [revision, setRevision] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [template, setTemplate] = useState<string | null>(null)
  const [level, setLevel] = useState<Level>('easy')
  const [mode, setMode] = useState<'duration' | 'calories'>('duration')
  const [duration, setDuration] = useState('30')
  const [calories, setCalories] = useState('200')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true), saving = useRef(false)
  const value = Number(mode === 'duration' ? duration : calories)
  const valid = Number.isInteger(value) && value >= (mode === 'duration' ? 15 : 1) && value <= (mode === 'duration' ? 60 : 5000)
  const target: CatalogTarget = mode === 'duration' ? { duration_sec: value * 60 } : { active_kcal: value }
  const key = JSON.stringify([profile, target, revision])
  const state: LoadState<CatalogOption[]> = result?.key === key ? result.state : { status: 'loading' }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setError('')
    if (!valid) return
    const timer = window.setTimeout(() => {
      const [, request] = JSON.parse(key) as [string, CatalogTarget, number]
      previewCatalog(profile, request).then(data => { if (active) setResult({ key, state: { status: 'ok', data } }) })
        .catch(e => { if (active) setResult({ key, state: { status: 'error', message: errorMessage(e) } }) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [profile, key, valid])
  const options = state.status === 'ok' ? state.data : []
  const missingWeight = mode === 'calories' && options[0]?.weight_kg === null
  const selected = options.find(w => w.template_id === template && w.level === level)
  const shown = selected?.workout
  const groups = goal ? [goal] : Object.keys(GOALS) as Goal[]
  const controls = <TargetControls mode={mode} duration={duration} calories={calories} disabled={busy}
    onMode={setMode} onDuration={setDuration} onCalories={setCalories} />
  const feedback = !valid ? <p role="alert" className="mb-4 text-subhead text-red">{mode === 'duration'
    ? 'Choisissez un nombre entier de minutes entre 15 et 60.' : 'Choisissez un nombre entier de calories entre 1 et 5 000.'}</p>
    : state.status === 'loading' ? <WorkoutLoading cards={template ? 1 : 2} />
      : state.status === 'error' ? <WorkoutError message={state.message} retry={() => setRevision(v => v + 1)} /> : null
  return <>
    <div className="mb-5 desk:max-w-[480px]">{controls}
      <Segmented label="Difficulté du catalogue" value={level} disabled={busy} onChange={setLevel}
        options={(Object.entries(LEVELS) as [Level, string][]).map(([value, label]) => ({ value, label }))} />
    </div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Objectifs du catalogue">
      <Button size="md" variant={goal === null ? 'primary' : 'gray'} onClick={() => setGoal(null)} aria-pressed={goal === null}>Tous</Button>
      {(Object.entries(GOALS) as [Goal, string][]).map(([key, label]) => <Button key={key} size="md" variant={goal === key ? 'primary' : 'gray'} aria-pressed={goal === key} onClick={() => setGoal(key)}>{label}</Button>)}
    </div>
    {feedback}
    {missingWeight && <WeightLink className="mb-4" />}
    {!missingWeight && options.length > 0 && groups.map(key => <section key={key} className="mb-8">
      <h2 className="mb-3 px-1 text-title2">{GOALS[key]}</h2>
      <div className="grid gap-3 desk:grid-cols-2">{options.filter(w => w.goal === key && w.level === level).map(w => <button key={w.template_id}
        onClick={() => { setTemplate(w.template_id); setError('') }} className="pressable min-w-0 rounded-[22px] bg-surface p-4 text-left desk:hover:bg-[#232325]">
        {w.workout ? <WorkoutCard data={w.workout} /> : <><h3 className="text-headline">{w.name}</h3><p className="mt-2 text-subhead text-orange">{w.message}</p></>}
        <p className="mt-3 text-footnote text-label-2">{w.description}</p>
      </button>)}</div>
    </section>)}
    <Sheet open={!!template} onClose={() => { if (!busy) setTemplate(null) }} title={selected?.name ?? 'Séance'}
      trailing={<button disabled={busy} className="min-h-11 text-body text-accent disabled:text-label-3" onClick={() => setTemplate(null)}>Fermer</button>}>
      {controls}
      <Segmented label="Difficulté du programme" value={level} disabled={busy} onChange={setLevel} options={(Object.entries(LEVELS) as [Level, string][]).map(([value, label]) => ({ value, label }))} />
      <div className="mt-4">{feedback}</div>
      {selected?.message && <p role="status" className="mt-4 text-subhead text-orange">{selected.message}</p>}
      {mode === 'calories' && selected?.weight_kg === null && <WeightLink className="mt-3" />}
      {shown && <>
        <div className="mt-4"><WorkoutLabels data={shown} /><WorkoutSummary data={shown} compact /></div>
        <WorkoutBlocks data={shown} />
        <p className="mt-4 text-footnote text-label-2">Le niveau décrit ces consignes, pas votre capacité physique. Vous pourrez les modifier.</p>
        {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
        <Button className="mt-5 w-full" disabled={busy} onClick={async () => {
          if (saving.current) return
          saving.current = true; setBusy(true); setError('')
          try { const saved = await addCatalog(profile, shown, target); if (mounted.current) navigate(href.workout(saved.id)) }
          catch (e) { if (mounted.current) setError(errorMessage(e)) }
          finally { saving.current = false; if (mounted.current) setBusy(false) }
        }}>{busy ? 'Ajout…' : 'Ajouter à mes séances'}</Button>
      </>}
    </Sheet>
  </>
}
