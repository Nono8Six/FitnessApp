import { ArrowDown, ArrowUp, Minus, Plus, Repeat as RepeatIcon, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Page } from '../components/Shell'
import { Button, cx, StatGrid } from '../components/ui'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { GOALS, LEVELS, isRepeat, KIND_LABEL, readWorkout, saveWorkout, usePreview, type Goal, type Level, type Item, type LoadState, type Step, type Workout } from '../lib/workouts'
import { acceptWorkoutProposal, readWorkoutProposal, type WorkoutProposal } from '../lib/coach'
import { WorkoutDifferences } from '../components/WorkoutProposal'

/** Le texte saisi reste visible, même invalide. Aucun retour silencieux à l'ancienne valeur. */
function NumberField({ value, onChange, step, label, unit, error }: {
  value: number; onChange: (value: number) => void; step: number; label: string; unit: string; error?: string
}) {
  const errorId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const formatted = Number.isFinite(value) ? String(Number(value.toFixed(4))).replace('.', ',') : ''
  const adjust = (delta: number) => {
    setDraft(null)
    onChange(Number(((Number.isFinite(value) ? value : 0) + delta).toFixed(4)))
  }
  return <div className="g-row pl-4">
    <div className="row-sep flex min-h-[52px] items-center gap-2 py-1 pr-3">
      <span className="min-w-0 flex-1 text-body">{label}</span>
      <label className="flex shrink-0 items-baseline gap-1">
        <input aria-label={`${label} (${unit})`} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} inputMode="decimal" value={draft ?? formatted}
          onFocus={e => { setDraft(formatted); e.target.select() }}
          onChange={e => {
            const text = e.target.value
            setDraft(text)
            onChange(text.trim() && /^\d*(?:[.,]\d*)?$/.test(text) ? Number(text.replace(',', '.')) : NaN)
          }}
          onBlur={() => { if (Number.isFinite(value)) setDraft(null) }}
          className={cx('num h-11 w-14 rounded-[8px] bg-transparent text-right text-body font-semibold outline-none focus:bg-fill-3', !!error && 'text-red')} />
        <span className="w-9 text-subhead text-label-2">{unit}</span>
      </label>
      <div className="flex items-center rounded-[8px] bg-fill-3">
        <button type="button" aria-label={`Diminuer ${label}`} onClick={() => adjust(-step)} className="grid size-11 place-items-center rounded-l-[8px] active:bg-fill-2"><Minus size={18} /></button>
        <span className="h-4 w-px bg-sep" />
        <button type="button" aria-label={`Augmenter ${label}`} onClick={() => adjust(step)} className="grid size-11 place-items-center rounded-r-[8px] active:bg-fill-2"><Plus size={18} /></button>
      </div>
    </div>
    {error && <p id={errorId} className="pr-4 pb-3 text-footnote text-red">{error}</p>}
  </div>
}

function StepFields({ value, onChange, errorAt }: { value: Step; onChange: (value: Step) => void; errorAt: (field: string) => string | undefined }) {
  return <>
    <label className="flex min-h-11 items-center justify-between gap-3 px-4 pt-1 text-footnote text-label-2">Type
      <select aria-label="Type de bloc" value={value.kind} onChange={e => onChange({ ...value, kind: e.target.value as Step['kind'] })}
        className="h-11 min-w-0 max-w-[75%] bg-surface text-subhead font-semibold text-label">
        {Object.entries(KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
      </select>
    </label>
    <NumberField label="Durée" unit="min" step={0.5} value={value.sec / 60} error={errorAt('sec')} onChange={v => onChange({ ...value, sec: Number((v * 60).toFixed(4)) })} />
    <NumberField label="Vitesse" unit="km/h" step={0.5} value={value.speed} error={errorAt('speed')} onChange={v => onChange({ ...value, speed: v })} />
    <NumberField label="Pente" unit="%" step={0.5} value={value.incline} error={errorAt('incline')} onChange={v => onChange({ ...value, incline: v })} />
  </>
}

let nextKey = 0
const entry = (value: Item) => ({ key: ++nextKey, value })
const newStep = (): Step => ({ kind: 'steady', sec: 300, speed: 5, incline: 0 })

function EditorForm({ profile, source, proposal }: { profile: string; source?: Workout; proposal?: WorkoutProposal }) {
  const initial = proposal?.workout ?? source
  const [name, setName] = useState(initial?.name ?? '')
  const [goal, setGoal] = useState<Goal | null>(initial?.goal ?? null)
  const [level, setLevel] = useState<Level | null>(initial?.level ?? null)
  const [entries, setEntries] = useState(() => (initial?.items ?? [newStep()]).map(entry))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const input = { name, items: entries.map(e => e.value), goal, level }
  const { state: preview, retry } = usePreview(profile, input)
  const errorAt = (path: (string | number)[]) => preview.status === 'error'
    ? preview.issues?.find(issue => JSON.stringify(issue.path) === JSON.stringify(path))?.message : undefined
  const dirty = JSON.stringify(input) !== JSON.stringify(initial ? { name: initial.name, items: initial.items, goal: initial.goal ?? null, level: initial.level ?? null } : { name: '', items: [newStep()], goal: null, level: null })
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  const update = (index: number, value: Item) => setEntries(list => list.map((e, i) => i === index ? { ...e, value } : e))
  const move = (index: number, offset: number) => setEntries(list => {
    const result = [...list]; [result[index], result[index + offset]] = [result[index + offset], result[index]]; return result
  })
  const save = async () => {
    if (saving || preview.status !== 'ok') return
    setSaving(true); setError('')
    try {
      const saved = proposal ? await acceptWorkoutProposal(profile, proposal.id, input) : await saveWorkout(profile, input, source)
      if (mounted.current) navigate(href.workout(saved.id))
    } catch (e) {
      console.warn('Fitness : enregistrement de séance impossible', e)
      setError(errorMessage(e)); setSaving(false)
    }
  }
  return <Page title={proposal ? 'Modifier la proposition' : source ? 'Modifier' : 'Nouvelle séance'} showAvatar={false} back={{ label: proposal ? 'Coach' : 'Séances', href: proposal ? href.coachConversation(proposal.conversation_id) : source ? href.workout(source.id) : href.myWorkouts }}
    trailing={<button className="pressable h-11 text-headline text-accent disabled:text-label-3" disabled={saving || preview.status !== 'ok' || (!dirty && !proposal)}
      onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>}>
    <fieldset disabled={saving} className="grid min-w-0 gap-7 desk:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] desk:items-start">
      <label className="block min-w-0 overflow-hidden rounded-[12px] bg-surface desk:col-start-1 desk:row-start-1">
        <span className="sr-only">Nom de la séance</span>
        <input autoComplete="off" maxLength={80} aria-label="Nom de la séance" aria-invalid={!!errorAt(['name'])} value={name} onChange={e => setName(e.target.value)}
          className="h-[52px] w-full bg-transparent px-4 text-headline outline-none placeholder:font-normal placeholder:text-label-3" placeholder="Nom de la séance" />
        {errorAt(['name']) && <span className="block px-4 pb-3 text-footnote text-red">{errorAt(['name'])}</span>}
      </label>
      <div className="order-last grid min-w-0 gap-7 desk:order-none desk:col-start-1">
        {entries.map(({ key, value: item }, i) => <section key={key} aria-label={`Bloc ${i + 1}`}>
          <div className="mb-2 flex items-center justify-between gap-2 pl-4">
            <h2 className="text-footnote font-semibold text-label-2 uppercase">{i + 1} · {isRepeat(item) ? 'Répétition' : KIND_LABEL[item.kind]}</h2>
            <div className="flex shrink-0">
              <button aria-label={`Monter le bloc ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-11 place-items-center text-label-2 disabled:text-label-3"><ArrowUp size={17} /></button>
              <button aria-label={`Descendre le bloc ${i + 1}`} disabled={i === entries.length - 1} onClick={() => move(i, 1)} className="grid size-11 place-items-center text-label-2 disabled:text-label-3"><ArrowDown size={17} /></button>
              <button aria-label={`Supprimer le bloc ${i + 1}`} onClick={() => setEntries(list => list.filter(e => e.key !== key))} className="grid size-11 place-items-center text-label-2 hover:text-red"><Trash2 size={17} /></button>
            </div>
          </div>
          <div className="overflow-hidden rounded-[12px] bg-surface">
            {isRepeat(item) ? <>
              <NumberField label="Répéter" unit="fois" step={1} value={item.repeat} error={errorAt(['items', i, 'repeat'])} onChange={repeat => update(i, { ...item, repeat })} />
              {item.steps.map((step, j) => <div key={j} className="border-t-[6px] border-black">
                <StepFields value={step} errorAt={field => errorAt(['items', i, 'steps', j, field])} onChange={value => update(i, { ...item, steps: item.steps.map((s, k) => k === j ? value : s) })} />
              </div>)}
              <div className="flex flex-wrap gap-1 border-t-[6px] border-black p-2">
                <Button variant="plain" size="md" onClick={() => update(i, { ...item, steps: [...item.steps, newStep()] })}>Ajouter un bloc</Button>
                {item.steps.length > 1 && <Button variant="plain" size="md" onClick={() => update(i, { ...item, steps: item.steps.slice(0, -1) })}>Retirer le dernier</Button>}
              </div>
            </> : <StepFields value={item} errorAt={field => errorAt(['items', i, field])} onChange={value => update(i, value)} />}
          </div>
        </section>)}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="gray" size="md" disabled={entries.length >= 120} onClick={() => setEntries(list => [...list, entry(newStep())])}><Plus size={18} />Bloc</Button>
          <Button variant="gray" size="md" disabled={entries.length >= 120} onClick={() => setEntries(list => [...list, entry({ repeat: 3, steps: [newStep(), { kind: 'recover', sec: 60, speed: 4, incline: 0 }] })])}><RepeatIcon size={18} />Répétition</Button>
        </div>
      </div>
      <aside className="min-w-0 desk:sticky desk:top-16 desk:col-start-2 desk:row-span-2 desk:row-start-1" aria-label="Aperçu">
        <div className="mb-4 grid grid-cols-1 gap-2">
          <label className="flex min-h-11 items-center justify-between gap-2 rounded-[12px] bg-surface px-3 text-subhead">Objectif
            <select aria-label="Objectif de la séance" className="h-11 min-w-0 max-w-[75%] bg-surface text-right text-label-2" value={goal ?? ''} onChange={e => setGoal((e.target.value || null) as Goal | null)}>
              <option value="">Non renseigné</option>{Object.entries(GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center justify-between gap-2 rounded-[12px] bg-surface px-3 text-subhead">Niveau
            <select aria-label="Niveau de la séance" className="h-11 bg-surface text-label-2" value={level ?? ''} onChange={e => setLevel((e.target.value || null) as Level | null)}>
              <option value="">Non renseigné</option>{Object.entries(LEVELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {preview.status === 'ok' ? <WorkoutSummary data={preview.data} editing /> : <>
          <StatGrid stats={['Durée prévue', 'Distance prévue', 'Kcal actives est.', 'Dénivelé équiv.'].map(label => ({ label, value: null, color: '' }))} />
          {/* Les erreurs de champ s'affichent sous leur champ ; ici, seulement l'état et les erreurs sans champ. */}
          {preview.status === 'error' ? !(preview.issues?.length && preview.issues.every(issue => issue.path.length > 0)) && <>
            <p role="alert" className="mt-3 px-4 text-footnote text-red">{preview.message}</p>
            <button onClick={retry} className="min-h-11 px-4 text-footnote text-accent">Vérifier à nouveau</button>
          </> : <p role="status" className="mt-3 px-4 text-footnote text-label-2">Calcul de l’aperçu…</p>}
        </>}
        <p className="mt-3 px-4 text-footnote text-label-2">60 min maximum · 120 segments · 1–16 km/h · pente 0–10 %</p>
        {source && <p className="mt-1 px-4 text-footnote text-label-2">La version {source.version} sera conservée.</p>}
        {proposal?.base && preview.status === 'ok' && <WorkoutDifferences before={proposal.base} after={preview.data} />}
        {source && <div className="mt-3 px-4">
          <a aria-disabled={dirty || saving} href={dirty || saving ? undefined : href.coachAdjust(source.id, source.version)} className={dirty || saving ? 'text-subhead text-label-3' : 'inline-flex min-h-11 items-center text-subhead text-accent'}>Ajuster avec ChatGPT</a>
          {dirty && <p className="mt-2 text-footnote text-label-2">Enregistrez vos changements avant de demander un ajustement.</p>}
        </div>}
        {error && <p role="alert" className="mt-4 px-4 text-subhead text-red">{error}</p>}
      </aside>
    </fieldset>
  </Page>
}

export function Editor({ profile, id, proposalId }: { profile: string; id?: string; proposalId?: string }) {
  const [source, setSource] = useState<LoadState<Workout>>({ status: 'loading' })
  const [proposal, setProposal] = useState<LoadState<WorkoutProposal>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!proposalId) return
    let active = true; setProposal({ status: 'loading' })
    readWorkoutProposal(profile, proposalId).then(data => { if (active) setProposal({ status: 'ok', data }) })
      .catch(e => { if (active) setProposal({ status: 'error', message: errorMessage(e) }) })
    return () => { active = false }
  }, [profile, proposalId, revision])
  useEffect(() => {
    if (!id) return
    let active = true
    setSource({ status: 'loading' })
    readWorkout(profile, id).then(data => { if (active) setSource({ status: 'ok', data }) }).catch(e => {
      if (active) { console.warn('Fitness : lecture de séance impossible', e); setSource({ status: 'error', message: errorMessage(e) }) }
    })
    return () => { active = false }
  }, [profile, id, revision])
  if (proposalId) {
    if (proposal.status === 'ok' && proposal.data.status === 'pending') return <EditorForm profile={profile} proposal={proposal.data} />
    return <Page title="Proposition" back={{ label: 'Coach', href: href.coach }}>
      {proposal.status === 'loading' ? <WorkoutLoading /> : <WorkoutError message={proposal.status === 'error' ? proposal.message : 'Cette proposition a déjà été enregistrée ou ignorée.'} retry={() => setRevision(v => v + 1)} />}
    </Page>
  }
  if (!id) return <EditorForm profile={profile} />
  if (source.status === 'ok') return <EditorForm profile={profile} source={source.data} />
  return <Page title="Modifier" back={{ label: 'Séances', href: href.library }}>
    {source.status === 'loading' ? <WorkoutLoading /> : <WorkoutError message={source.message} retry={() => setRevision(v => v + 1)} />}
  </Page>
}
