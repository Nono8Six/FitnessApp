import { ChevronDown, Pencil, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { LibraryIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Glyph, Menu, pillClass, SearchField, Segmented } from '../components/ui'
import { WorkoutCard } from '../components/WorkoutCard'
import { WeightLink, WorkoutError, WorkoutLoading } from '../components/WorkoutSummary'
import { href, navigate } from '../lib/router'
import { GOAL_SHORT, GOALS, LEVELS, useLibrary, type Goal, type Level, type Workout } from '../lib/workouts'
import { Discover } from './Discover'

const origin = (w: Workout) => w.origin?.kind === 'catalog' ? 'Catalogue' : w.origin?.kind === 'chatgpt' ? 'ChatGPT' : 'Création manuelle'

/** Filtre en capsule : « Tous » ou la valeur choisie, comme les menus déroulants d'iOS. */
function FilterMenu<T extends string>({ label, all, value, options, onChange }: {
  label: string; all: string; value: T | ''; options: Record<T, string>; onChange: (v: T | '') => void
}) {
  return <Menu label={`${label} : ${value ? options[value] : all}`} align="start"
    className={`${pillClass} ${value ? 'bg-label! text-black' : ''}`}
    button={<>{value ? options[value] : label}<ChevronDown size={15} strokeWidth={2.6} className={value ? 'text-black/60' : 'text-label-2'} /></>}
    items={[{ label: all, checked: value === '', onSelect: () => onChange('') }, 'separator',
      ...(Object.entries(options) as [T, string][]).map(([key, text]) => ({ label: text, checked: value === key, onSelect: () => onChange(key) }))]} />
}

export function Library({ profile, initialView = 'discover' }: { profile: string; initialView?: 'discover' | 'mine' }) {
  const [q, setQ] = useState('')
  const [goal, setGoal] = useState<Goal | ''>('')
  const [level, setLevel] = useState<Level | ''>('')
  const { state, reload } = useLibrary(profile)
  const needle = q.trim().toLocaleLowerCase('fr')
  const list = state.status === 'ok' ? state.data.workouts.filter(p => p.name.toLocaleLowerCase('fr').includes(needle)
    && (!goal || p.goal === goal) && (!level || p.level === level)) : []
  const create = <Menu label="Créer une séance" className="pressable grid size-[34px] place-items-center rounded-full bg-fill-3 text-accent"
    button={<Plus size={20} strokeWidth={2.6} />}
    items={[
      { label: 'Créer avec ChatGPT', icon: <Sparkles size={18} />, onSelect: () => navigate(href.coachCreate) },
      { label: 'Nouvelle séance', icon: <Pencil size={17} />, onSelect: () => navigate(href.newWorkout) },
    ]} />
  return <Page title="Séances" actions={create}>
    <Segmented className="mb-5 desk:max-w-[400px]" label="Bibliothèque" value={initialView}
      onChange={v => navigate(v === 'mine' ? href.myWorkouts : href.library)} options={[{ value: 'discover', label: 'Découvrir' }, { value: 'mine', label: 'Mes séances' }]} />
    {initialView === 'discover' ? <Discover profile={profile} /> : <>
      {state.status === 'loading' ? <WorkoutLoading cards={2} /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
        : state.data.workouts.length === 0 ? <section className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center">
          <Glyph size={64}><LibraryIcon size={30} /></Glyph>
          <h2 className="mt-4 text-title3">Aucune séance enregistrée</h2>
          <p className="mt-1.5 max-w-[34ch] text-subhead text-label-2">Ajoutez un programme du catalogue ou créez le vôtre.</p>
          <div className="mt-6 grid w-full max-w-[320px] gap-2.5">
            <a href={href.library} className="pressable inline-flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-headline text-on-accent">Découvrir</a>
            <a href={href.coachCreate} className="pressable inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-fill-3 text-subhead font-semibold"><Sparkles size={17} />Créer avec ChatGPT</a>
          </div>
        </section> : <>
          <SearchField value={q} onChange={setQ} label="Rechercher une séance" className="mb-3 desk:max-w-[400px]" maxLength={80} />
          <div className="mb-5 flex flex-wrap gap-2">
            <FilterMenu label="Objectif" all="Tous les objectifs" value={goal} options={GOAL_SHORT} onChange={setGoal} />
            <FilterMenu label="Niveau" all="Tous les niveaux" value={level} options={LEVELS} onChange={setLevel} />
          </div>
          {state.data.workouts[0].summary.energy.weight_kg === null && <WeightLink className="mb-3" />}
          <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">{list.map(p => <a key={p.id} href={href.workout(p.id)}
            className="pressable flex min-w-0 flex-col rounded-[22px] bg-surface p-4 desk:p-5 desk:hover:bg-[#232325]">
            <WorkoutCard data={p} selected={state.data.selected_id === p.id} />
            <p className="mt-3 text-footnote text-label-2">{p.goal ? `${GOALS[p.goal]} · ` : ''}{origin(p)}</p>
          </a>)}</div>
          {!list.length && <div className="py-10 text-center">
            <p className="text-headline">Aucun résultat</p>
            <p className="mt-1 text-subhead text-label-2">{needle ? `Aucune séance ne contient « ${q.trim()} » avec ces filtres.` : 'Aucune séance ne correspond à ces filtres.'}</p>
            <button type="button" onClick={() => { setQ(''); setGoal(''); setLevel('') }} className="pressable mt-2 min-h-11 text-subhead text-accent">Effacer les filtres</button>
          </div>}
        </>}
    </>}
  </Page>
}
