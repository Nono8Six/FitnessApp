import { ChevronRight, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { ProgrammeMini } from '../components/charts'
import { LibraryIcon, RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Glyph } from '../components/ui'
import { WeightLink, WorkoutError, WorkoutLoading } from '../components/WorkoutSummary'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import { useLibrary } from '../lib/workouts'

export function Library({ profile }: { profile: string }) {
  const [q, setQ] = useState('')
  const { state, reload } = useLibrary(profile)
  const list = state.status === 'ok' ? state.data.workouts.filter(p => p.name.toLocaleLowerCase('fr').includes(q.trim().toLocaleLowerCase('fr'))) : []
  return <Page title="Séances" actions={<a href={href.newWorkout} aria-label="Nouvelle séance"
    className="pressable grid size-[34px] place-items-center rounded-full bg-fill-3 text-accent"><Plus size={20} strokeWidth={2.6} /></a>}>
    {state.status === 'loading' ? <WorkoutLoading cards={2} /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
      : state.data.workouts.length === 0 ? <section className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center">
        <Glyph size={64}><LibraryIcon size={30} /></Glyph><h2 className="mt-4 text-title3">Votre première séance</h2>
        <p className="mt-2 max-w-80 text-subhead text-label-2">Composez vos blocs et vos répétitions, puis retrouvez-les ici.</p>
        <a href={href.newWorkout} className="pressable mt-6 inline-flex h-[52px] items-center gap-2 rounded-[14px] bg-accent px-5 text-headline text-on-accent"><Plus size={20} />Créer une séance</a>
      </section> : <>
        <label className="mb-4 flex h-9 items-center gap-1.5 rounded-[10px] bg-fill-3 px-2 text-label-2 desk:max-w-[360px]">
          <Search size={17} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une séance"
            className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2" />
        </label>
        {state.data.workouts[0].summary.energy.weight_kg === null && <WeightLink className="mb-3" />}
        <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">
          {list.map(p => {
            const kcal = p.summary.energy.active_kcal
            return <a key={p.id} href={href.workout(p.id)} className="pressable block min-w-0 rounded-[22px] bg-surface p-4 desk:hover:bg-[#232325]">
              <div className="flex items-center gap-3">
                <Glyph size={40}><RunIcon size={22} /></Glyph>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-headline">{p.name}</h2>
                  <p className="num text-footnote text-label-2">{dec1(p.summary.minSpeed)}–{dec1(p.summary.maxSpeed)} km/h · {p.summary.count} segments</p>
                </div>
                <ChevronRight size={20} strokeWidth={2.4} className="shrink-0 text-label-3" />
              </div>
              <p className="num mt-3 flex flex-wrap items-baseline gap-x-4 text-[22px] leading-7 font-semibold">
                <span className="text-time">{clock(p.summary.sec)}</span>
                <span className="text-distance">{dec1(p.summary.km)}<span className="ml-0.5 text-[16px]">KM</span></span>
                {kcal !== null && <span className="text-energy">≈ {Math.round(kcal)}<span className="ml-0.5 text-[16px]">KCAL</span></span>}
                {state.data.selected_id === p.id && <span className="ml-auto self-center rounded-full bg-accent/15 px-2.5 py-0.5 text-caption font-semibold text-accent">Prochaine séance</span>}
              </p>
              <ProgrammeMini blocks={p.blocks} height={48} className="mt-3" />
            </a>
          })}
        </div>
        {!list.length && <p className="py-10 text-center text-subhead text-label-2">Aucun résultat pour « {q} ».</p>}
      </>}
  </Page>
}
