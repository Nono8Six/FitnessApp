import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Page } from '../components/Shell'
import { Segmented } from '../components/ui'
import { WorkoutCard } from '../components/WorkoutCard'
import { WeightLink, WorkoutError, WorkoutLoading } from '../components/WorkoutSummary'
import { href, navigate } from '../lib/router'
import { GOALS, LEVELS, useLibrary, type Goal, type Level } from '../lib/workouts'
import { Discover } from './Discover'

export function Library({ profile, initialView = 'discover' }: { profile: string; initialView?: 'discover' | 'mine' }) {
  const [q, setQ] = useState('')
  const [goal, setGoal] = useState<Goal | ''>('')
  const [level, setLevel] = useState<Level | ''>('')
  const { state, reload } = useLibrary(profile)
  const list = state.status === 'ok' ? state.data.workouts.filter(p => p.name.toLocaleLowerCase('fr').includes(q.trim().toLocaleLowerCase('fr'))
    && (!goal || p.goal === goal) && (!level || p.level === level)) : []
  return <Page title="Séances" actions={<a href={href.newWorkout} aria-label="Nouvelle séance"
    className="pressable grid size-[34px] place-items-center rounded-full bg-fill-3 text-accent"><Plus size={20} strokeWidth={2.6} /></a>}>
    <Segmented className="mb-4 desk:max-w-[400px]" label="Bibliothèque" value={initialView}
      onChange={v => navigate(v === 'mine' ? href.myWorkouts : href.library)} options={[{ value: 'discover', label: 'Découvrir' }, { value: 'mine', label: 'Mes séances' }]} />
    <div className="mb-6 flex flex-wrap gap-x-5">
      <a href={href.coachCreate} className="pressable inline-flex min-h-11 items-center text-subhead font-semibold text-accent">Créer avec ChatGPT</a>
      <a href={href.newWorkout} className="pressable inline-flex min-h-11 items-center text-subhead text-label-2">Création manuelle</a>
    </div>
    {initialView === 'discover' ? <Discover profile={profile} /> : <>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill-3 px-3 text-label-2 desk:max-w-[360px]">
          <Search size={17} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une séance"
            className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2" />
        </label>
        <select aria-label="Filtrer par objectif" value={goal} onChange={e => setGoal(e.target.value as Goal | '')} className="h-11 max-w-full rounded-[10px] bg-surface px-3 text-subhead">
          <option value="">Tous les objectifs</option>{Object.entries(GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filtrer par niveau" value={level} onChange={e => setLevel(e.target.value as Level | '')} className="h-11 rounded-[10px] bg-surface px-3 text-subhead">
          <option value="">Tous les niveaux</option>{Object.entries(LEVELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {state.status === 'loading' ? <WorkoutLoading cards={2} /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
        : state.data.workouts.length === 0 ? <div className="py-10 text-center">
          <h2 className="text-title3">Aucune séance enregistrée</h2>
          <p className="mt-2 text-subhead text-label-2">Choisissez une séance dans Découvrir ou créez la vôtre.</p>
        </div> : <>
          {state.data.workouts[0].summary.energy.weight_kg === null && <WeightLink className="mb-3" />}
          <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">{list.map(p => <a key={p.id} href={href.workout(p.id)}
            className="pressable block min-w-0 rounded-[22px] bg-surface p-4 desk:hover:bg-[#232325]">
            <WorkoutCard data={p} selected={state.data.selected_id === p.id} />
            <p className="mt-3 text-footnote text-label-2">{p.goal && `${GOALS[p.goal]} · `}{p.origin?.kind === 'catalog' ? 'Modèle du catalogue' : p.origin?.kind === 'chatgpt' ? 'Proposition ChatGPT' : 'Création manuelle'}</p>
          </a>)}</div>
          {!list.length && <p className="py-10 text-center text-subhead text-label-2">Aucune séance ne correspond à ces filtres.</p>}
        </>}
    </>}
  </Page>
}
