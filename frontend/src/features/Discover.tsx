import { useEffect, useRef, useState } from 'react'
import { Button, Segmented, Sheet } from '../components/ui'
import { WorkoutCard, WorkoutLabels } from '../components/WorkoutCard'
import { WorkoutBlocks } from '../components/WorkoutBlocks'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { addCatalog, GOALS, LEVELS, readCatalog, type CatalogWorkout, type Goal, type Level, type LoadState } from '../lib/workouts'

export function Discover({ profile }: { profile: string }) {
  const [state, setState] = useState<LoadState<CatalogWorkout[]>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [template, setTemplate] = useState<string | null>(null)
  const [level, setLevel] = useState<Level>('easy')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true), saving = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true; setState({ status: 'loading' })
    readCatalog(profile).then(data => { if (active) setState({ status: 'ok', data }) })
      .catch(e => { if (active) setState({ status: 'error', message: errorMessage(e) }) })
    return () => { active = false }
  }, [profile, revision])
  if (state.status === 'loading') return <WorkoutLoading cards={2} />
  if (state.status === 'error') return <WorkoutError message={state.message} retry={() => setRevision(v => v + 1)} />
  const shown = state.data.find(w => w.template_id === template && w.level === level)
  const groups = goal ? [goal] : Object.keys(GOALS) as Goal[]
  return <>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Objectifs du catalogue">
      <Button size="md" variant={goal === null ? 'primary' : 'gray'} onClick={() => setGoal(null)} aria-pressed={goal === null}>Tous</Button>
      {(Object.entries(GOALS) as [Goal, string][]).map(([key, label]) => <Button key={key} size="md" variant={goal === key ? 'primary' : 'gray'} aria-pressed={goal === key} onClick={() => setGoal(key)}>{label}</Button>)}
    </div>
    {groups.map(key => <section key={key} className="mb-8">
      <h2 className="mb-3 px-1 text-title2">{GOALS[key]}</h2>
      <div className="grid gap-3 desk:grid-cols-2">{state.data.filter(w => w.goal === key && w.level === 'easy').map(w => <button key={w.template_id}
        onClick={() => { setTemplate(w.template_id); setLevel('easy'); setError('') }} className="pressable min-w-0 rounded-[22px] bg-surface p-4 text-left desk:hover:bg-[#232325]">
        <WorkoutCard data={w} /><p className="mt-3 text-footnote text-label-2">3 niveaux · {w.description}</p>
      </button>)}</div>
    </section>)}
    <Sheet open={!!shown} onClose={() => { if (!busy) setTemplate(null) }} title={shown?.name ?? 'Séance'}
      trailing={<button disabled={busy} className="min-h-11 text-body text-accent disabled:text-label-3" onClick={() => setTemplate(null)}>Fermer</button>}>
      {shown && <>
        <Segmented label="Difficulté du programme" value={level} disabled={busy} onChange={setLevel} options={(Object.entries(LEVELS) as [Level, string][]).map(([value, label]) => ({ value, label }))} />
        <div className="mt-4"><WorkoutLabels data={shown} /><WorkoutSummary data={shown} /></div>
        <WorkoutBlocks data={shown} />
        <p className="mt-4 text-footnote text-label-2">Le niveau décrit ces consignes, pas votre capacité physique. Vous pourrez les modifier.</p>
        {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
        <Button className="mt-5 w-full" disabled={busy} onClick={async () => {
          if (saving.current) return
          saving.current = true; setBusy(true); setError('')
          try { const saved = await addCatalog(profile, shown); if (mounted.current) navigate(href.workout(saved.id)) }
          catch (e) { if (mounted.current) setError(errorMessage(e)) }
          finally { saving.current = false; if (mounted.current) setBusy(false) }
        }}>{busy ? 'Ajout…' : 'Ajouter à mes séances'}</Button>
      </>}
    </Sheet>
  </>
}
