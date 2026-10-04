import { Check, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { ProgrammeChart } from '../components/charts'
import { LibraryIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { WorkoutError, WorkoutLoading } from '../components/WorkoutSummary'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import { useLibrary } from '../lib/workouts'

export function Library({ profile }: { profile: string }) {
  const [q, setQ] = useState('')
  const { state, reload } = useLibrary(profile)
  const list = state.status === 'ok' ? state.data.workouts.filter(p => p.name.toLocaleLowerCase('fr').includes(q.trim().toLocaleLowerCase('fr'))) : []
  return <Page title="Séances" trailing={<a href={href.newWorkout} aria-label="Nouvelle séance"
    className="pressable grid size-11 place-items-center rounded-full bg-fill-3 text-accent"><Plus size={22} /></a>}>
    {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
      : state.data.workouts.length === 0 ? <section className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center">
        <LibraryIcon size={36} className="text-label-2" /><h2 className="mt-4 text-headline">Votre première séance</h2>
        <p className="mt-2 max-w-80 text-subhead text-label-2">Composez vos blocs et vos répétitions, puis retrouvez-les ici.</p>
        <a href={href.newWorkout} className="pressable mt-6 inline-flex h-[52px] items-center gap-2 rounded-[14px] bg-accent px-5 text-headline text-on-accent"><Plus size={20} />Créer une séance</a>
      </section> : <>
        <label className="mb-5 flex h-11 items-center gap-2 rounded-[10px] bg-fill-3 px-3 text-label-2 desk:max-w-[360px]">
          <Search size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une séance"
            className="min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2" />
        </label>
        <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">
          {list.map(p => <article key={p.id} className="min-w-0 rounded-[22px] bg-surface p-5">
            <a href={href.workout(p.id)} className="pressable block rounded-[8px] focus-visible:outline-2 focus-visible:outline-accent">
            <div className="flex items-baseline justify-between gap-3"><h2 className="min-w-0 break-words text-headline">{p.name}</h2><span className="num shrink-0 text-subhead text-label-2">{clock(p.summary.sec)}</span></div>
            <p className="num mt-1 text-footnote text-label-2">{dec1(p.summary.km)} km · {dec1(p.summary.minSpeed)}–{dec1(p.summary.maxSpeed)} km/h · {p.summary.count} segments</p>
            </a>
            <ProgrammeChart blocks={p.blocks} height={44} compact className="mt-4" />
            {state.data.selected_id === p.id && <p className="mt-3 flex items-center gap-1.5 text-footnote font-medium text-accent"><Check size={15} />Prochaine séance</p>}
            <a href={href.workout(p.id)} className="pressable mt-2 flex min-h-11 items-center justify-center rounded-[12px] bg-fill-3 text-subhead font-semibold text-accent">Voir la séance</a>
          </article>)}
        </div>
        {!list.length && <p className="py-10 text-center text-subhead text-label-2">Aucun résultat pour « {q} ».</p>}
      </>}
  </Page>
}
