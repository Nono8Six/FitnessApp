import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { useToday } from '../lib/date'
import { href } from '../lib/router'
import { useLibrary } from '../lib/workouts'

export function Today({ profile }: { profile: string }) {
  const today = useToday()
  const { state, reload } = useLibrary(profile)
  const selected = state.status === 'ok' ? state.data.workouts.find(w => w.id === state.data.selected_id) : undefined
  return (
    <Page title="Aujourd’hui" overline={today}>
      {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
        : selected ? <section aria-label="Prochaine séance" className="rounded-[22px] bg-surface p-5 desk:max-w-[760px] desk:p-7">
          <p className="text-footnote font-semibold text-accent">PROCHAINE SÉANCE</p>
          <h2 className="mt-2 mb-6 break-words text-title1">{selected.name}</h2>
          <WorkoutSummary data={selected} />
          <a href={href.workout(selected.id)} className="pressable mt-6 flex h-[52px] items-center justify-center rounded-[14px] bg-accent px-5 text-headline text-on-accent">Voir la séance</a>
          <a href={href.library} className="pressable mt-2 flex h-11 items-center justify-center text-subhead text-accent">Changer de séance</a>
        </section> : <section aria-label="Prochaine séance" className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center desk:max-w-[760px]">
        <span className="grid size-14 place-items-center rounded-full bg-fill-4 text-label-2">
          <RunIcon size={28} />
        </span>
        <p className="mt-4 text-headline">Aucune séance prévue</p>
        <a href={href.library} className="pressable mt-6 inline-flex h-[52px] items-center rounded-[14px] bg-accent px-5 text-headline text-on-accent">Choisir une séance</a>
      </section>}
    </Page>
  )
}
