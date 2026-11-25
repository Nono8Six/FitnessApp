import { ArrowRight, Bluetooth, CalendarDays, FlaskConical } from 'lucide-react'
import { ProgrammeMini } from '../components/charts'
import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Group, Row, SectionHeader, StatGrid, Tile } from '../components/ui'
import { WeightLink, WorkoutError, WorkoutLoading, workoutStats } from '../components/WorkoutSummary'
import { useToday } from '../lib/date'
import { courseTest, courseTestUrl } from '../lib/environment'
import { href } from '../lib/router'
import { dayText, useSchedule } from '../lib/schedule'
import { useLibrary } from '../lib/workouts'
import { StartButton } from './Direct'
import { RecordingRows } from './Reports'
import { TodayGoal } from './TrainingGoal'

export function Today({ profile }: { profile: string }) {
  const today = useToday()
  const { state, reload } = useLibrary(profile)
  const planning = useSchedule(profile)
  const week = planning.state.status === 'ok' ? planning.state.data : undefined
  const planned = week?.plan?.sessions.find(item => item.day === week.today)
  const next = week?.plan?.sessions.find(item => item.status === 'planned')
  const manual = state.status === 'ok' ? state.data.workouts.find(w => w.id === state.data.selected_id) : undefined
  const selected = planned ? planned.status === 'planned' ? planned.workout : null : manual
  const sessionLink = planned?.status === 'in_progress' ? href.direct
    : planned?.report ? href.report(planned.report.id) : planned ? href.planning
    : selected ? href.workout(selected.id) : href.library
  const sessionAction = planned?.status === 'in_progress' ? 'Revenir au Direct'
    : planned?.report ? 'Voir le bilan' : planned ? 'Voir dans le planning' : selected ? 'Voir les détails' : 'Choisir une séance'
  return <Page title="Aujourd’hui" subtitle={today}>
    <div className="today-layout">
      <section aria-label="Prochaine séance">
        {planning.state.status === 'loading' || !planned && state.status === 'loading' ? <WorkoutLoading />
          : !planned && state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
          : <>
            <div className="today-cover">
              <h2 className="flex items-center gap-2 text-footnote font-semibold"><RunIcon size={20} className="text-accent" />Prochaine séance</h2>
              <div className="today-cover-content">
                <h3>{planned?.name ?? selected?.name ?? 'Aucune séance prévue'}</h3>
                <a href={sessionLink} className={selected ? 'today-detail-link' : 'today-choose'}>
                  {sessionAction}<ArrowRight size={17} aria-hidden />
                </a>
              </div>
            </div>
            {selected && <>
              <StartButton profile={profile} workout={selected} className="mt-3 w-full" />
              <div className="mt-6"><SectionHeader title="Programme" action={planned ? undefined : 'Changer'} href={href.library} />
                <StatGrid stats={workoutStats(selected.summary)} compact />
                <ProgrammeMini blocks={selected.blocks} height={48} className="mt-3" />
              </div>
              {selected.summary.energy.weight_kg === null && <WeightLink className="mt-3" />}
            </>}
          </>}
      </section>
      <div className="grid min-w-0 content-start gap-7">
        <TodayGoal profile={profile} />
        <section aria-label="Planning">
          <SectionHeader title="Planning" />
          {planning.state.status === 'error' ? <WorkoutError message={planning.state.message} retry={planning.reload} />
            : <Group><Row href={href.planning} leading={<Tile><CalendarDays size={18} aria-hidden /></Tile>}
              title={week?.plan ? 'Cette semaine' : 'Mon planning'}
              subtitle={next ? `${dayText(next.day, true)} · ${next.name}`
                : week?.plan ? 'Voir les séances et leur suivi' : 'Préparer ma semaine avec le coach'} /></Group>}
        </section>
        <section aria-label="Dernier bilan">
          <SectionHeader title="Dernier bilan" action="Voir tout" href={href.recordings} />
          <RecordingRows profile={profile} latest />
        </section>
        <section aria-label="Tapis">
          <SectionHeader title="Tapis" />
          <Group>
            <Row href={href.treadmill} leading={<Tile><Bluetooth size={19} /></Tile>} title="Réglages du RUN500" />
            <Row href={courseTestUrl} leading={<Tile color="var(--color-label-2)"><FlaskConical size={18} /></Tile>} title="Tester le mode course" subtitle="Simulation sans tapis ni bilan réel" />
            {courseTest && <Row title="Quitter le test" href="/#/" />}
          </Group>
        </section>
      </div>
    </div>
  </Page>
}
