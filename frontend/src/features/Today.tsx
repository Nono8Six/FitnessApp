import { ChevronRight } from 'lucide-react'
import { ProgrammeMini } from '../components/charts'
import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Glyph, Group, Row, SectionHeader, StatGrid } from '../components/ui'
import { WeightLink, WorkoutError, WorkoutLoading, workoutStats } from '../components/WorkoutSummary'
import { useToday } from '../lib/date'
import { href } from '../lib/router'
import { useLibrary } from '../lib/workouts'
import { StartButton } from './Direct'

export function Today({ profile }: { profile: string }) {
  const today = useToday()
  const { state, reload } = useLibrary(profile)
  const selected = state.status === 'ok' ? state.data.workouts.find(w => w.id === state.data.selected_id) : undefined
  return (
    <Page title="Aujourd’hui" subtitle={today}>
      <div className="desk:max-w-[760px]">
        {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
          : selected ? <section aria-label="Prochaine séance">
            <SectionHeader title="Prochaine séance" action="Changer" href={href.library} />
            <a href={href.workout(selected.id)} className="pressable block rounded-[22px] bg-surface p-4 desk:p-5">
              <div className="flex items-center gap-3">
                <Glyph><RunIcon size={24} /></Glyph>
                <h3 className="min-w-0 flex-1 break-words text-title3">{selected.name}</h3>
                <ChevronRight size={20} strokeWidth={2.4} className="shrink-0 text-label-3" />
              </div>
              <StatGrid stats={workoutStats(selected.summary)} className="mt-4 [&>div]:bg-surface-2" />
              <ProgrammeMini blocks={selected.blocks} height={64} className="mt-4" />
            </a>
            <StartButton profile={profile} workout={selected} className="mt-4 w-full" />
            {selected.summary.energy.weight_kg === null && <WeightLink className="mt-3" />}
          </section> : <section aria-label="Prochaine séance" className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center">
            <Glyph size={64}><RunIcon size={32} /></Glyph>
            <p className="mt-4 text-title3">Aucune séance prévue</p>
            <a href={href.library} className="pressable mt-6 inline-flex h-[52px] items-center rounded-[14px] bg-accent px-6 text-headline text-on-accent">Choisir une séance</a>
          </section>}
        <Group className="mt-7"><Row title="Bilans" href={href.recordings} /></Group>
      </div>
    </Page>
  )
}
