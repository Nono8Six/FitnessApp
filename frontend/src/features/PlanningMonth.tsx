import { DayButton, DayPicker, type DayButtonProps } from '@daypicker/react'
import { fr } from '@daypicker/react/locale/fr'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { Skeleton } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { clock, dec2 } from '../lib/format'
import { href } from '../lib/router'
import { calendarByDay, dayText, monthText, shiftDay, shiftMonth, useScheduleMonth, weekStart,
  type CalendarActivity, type CalendarEntry, type CalendarItem, type EntryStatus } from '../lib/schedule'
import { ActivityMeta, CalendarMarks, dateLabel, PlanningPeriod, PlanningStatus, PlanningViews, revealPlanningItem, shortDays, statuses,
  VenueIcon, venueText } from './PlanningCalendar'

const asDate = (day: string) => new Date(`${day}T12:00:00Z`)
const asDay = (date: Date) => date.toISOString().slice(0, 10)
const MonthEntries = createContext<ReadonlyMap<string, CalendarItem[]>>(new Map())
const monthClasses = {
  month_caption: 'sr-only',
  month_grid: 'planning-month-grid',
  weekday: 'planning-weekday',
  day: 'planning-month-cell',
  day_button: 'planning-month-button pressable',
}

// DayPicker keeps the button, its focus management and keyboard events.
function MonthButton(props: DayButtonProps) {
  const entries = useContext(MonthEntries).get(asDay(props.day.date)) ?? []
  const entry = entries[0]
  return <DayButton {...props} data-status={entry?.status}>
    <span className="planning-date num">{props.children}</span>
    <CalendarMarks entries={entries} />
    {entry && <span className="planning-month-name" aria-hidden>{entry.name}</span>}
  </DayButton>
}
const monthComponents = { DayButton: MonthButton }

function MonthDay({ day, entry, activities, today }: { day: string; entry?: CalendarEntry; activities: CalendarActivity[]; today: string }) {
  const report = entry?.status === 'in_progress' ? null : entry?.report
  return <section id="planning-month-day" className="planning-month-detail" aria-label="Détail du jour">
    <div aria-live="polite" className="planning-month-readout">
      <h2 className="planning-detail-date first-letter:uppercase">
        <time dateTime={day}>{dayText(day, true)}</time>
        {day === today && <span>Aujourd’hui</span>}
      </h2>
      {entry ? <>
        <h3 className="planning-workout-name">{entry.name}</h3>
        <div className="planning-meta"><span className="text-yellow">{entry.minutes} min</span>
          <span><VenueIcon venue={entry.venue} size={14} />{venueText(entry.venue)}</span>
          <PlanningStatus status={entry.status} />
        </div>
        <p className="planning-description">{entry.purpose}</p>
        {report && <p className="planning-description">{clock(report.active_s)} actives
          {report.feeling != null && ` · Ressenti ${report.feeling}/10`}</p>}
        {report && <a className="planning-action pressable" href={href.report(report.id)}
          aria-label={`Voir le bilan de ${entry.name}`}>Voir le bilan<ChevronRight size={18} aria-hidden /></a>}
        {entry.manual && <p className="planning-description">{entry.manual.minutes} min réalisées
          {entry.manual.km != null && ` · ${dec2(entry.manual.km)} km`}
          {entry.manual.feeling != null && ` · Ressenti ${entry.manual.feeling}/10`}
        </p>}
      </> : activities.length === 0 && <p className="planning-description">Aucune séance ce jour.</p>}
    </div>
    {activities.length > 0 && <ul className="planning-month-activities" aria-label="Bilans du jour">
      {activities.map(activity => <li key={activity.id}>
        <a className="planning-month-activity pressable" href={href.report(activity.id)}>
          <span className="min-w-0">
            <span className="sr-only">Voir le bilan. </span>
            <span className="planning-workout-name">{activity.name}</span>
            <ActivityMeta activity={activity} />
          </span>
          <ChevronRight size={18} aria-hidden />
        </a>
      </li>)}
    </ul>}
    <div className="planning-month-actions">
      {entry?.status === 'in_progress' && <a className="planning-action pressable" href={href.direct}>Revenir au Direct</a>}
      <a className="planning-action pressable" href={href.planningWeek(weekStart(day), day)}>
        {entry && !report && entry.status !== 'in_progress' ? 'Voir la séance' : 'Ouvrir la semaine'}
        <ArrowRight size={17} aria-hidden />
      </a>
    </div>
  </section>
}

export default function MonthPlanning({ profile, month, day }: { profile: string; month?: string; day?: string }) {
  const { state, reload } = useScheduleMonth(profile, month)
  const [picked, setPicked] = useState<string | undefined>(() => window.history.state?.planningDay ?? day)
  const data = state.status === 'ok' ? state.data : undefined
  const sessions = data?.sessions ?? []
  const history = data?.history ?? []
  const all = [...sessions, ...history].sort((a, b) => a.day.localeCompare(b.day))
  const first = data && `${data.month}-01`
  const next = data && shiftMonth(data.month, 1)
  const last = next && shiftDay(`${next}-01`, -1)
  const selected = data && first && last
    ? picked && picked >= first && picked <= last ? picked : data.today.startsWith(data.month) ? data.today : all[0]?.day ?? first
    : undefined
  const loadedMonth = data?.month
  useLayoutEffect(() => {
    if (loadedMonth && window.history.state?.planningDay) {
      revealPlanningItem(document.getElementById('planning-month-day'), 'end')
    }
  }, [loadedMonth])
  useEffect(() => {
    // Conserver le jour dans cette entrée du navigateur pour le retour depuis un bilan.
    if (selected) window.history.replaceState({ ...window.history.state, planningDay: selected }, '')
  }, [selected])
  const count = all.length
  const date = first && asDate(first)
  const entries = calendarByDay(all)
  const present = Object.keys(statuses).filter(status => all.some(entry => entry.status === status)) as EntryStatus[]
  const select = (selectedDate: Date, reveal: boolean) => {
    setPicked(asDay(selectedDate))
    if (!reveal) return
    window.requestAnimationFrame(() => revealPlanningItem(document.getElementById('planning-month-day'), 'end'))
  }
  return <>
    <PlanningViews view="month" weekHref={selected ? href.planningWeek(weekStart(selected), selected) : href.planning}
      monthHref={href.planningMonth(month, day)}
      todayHref={data ? href.planningMonth(data.today.slice(0, 7), data.today) : href.planningMonth()}
      onToday={() => { if (data?.today.startsWith(data.month)) select(asDate(data.today), false) }} />
    {state.status === 'loading' && <Skeleton label="Chargement du mois" />}
    {state.status === 'error' && <WorkoutError message={state.message} retry={reload} />}
    {data && date && selected && <div className="planning-layout">
      <PlanningPeriod period="mois" title={monthText(data.month)}
        subtitle={count === 0 ? 'Aucune séance au calendrier' : `${count} séance${count > 1 ? 's' : ''}`}
        previous={data.month > '1900-01' ? href.planningMonth(shiftMonth(data.month, -1)) : undefined}
        next={data.month < '9998-12' && next ? href.planningMonth(next) : undefined}>
        <MonthEntries.Provider value={entries}>
          <DayPicker className="planning-month-picker" classNames={monthClasses} components={monthComponents}
            locale={fr} timeZone="UTC" month={date} startMonth={date} endMonth={date} hideNavigation
            mode="single" required selected={asDate(selected)} today={asDate(data.today)}
            aria-label={monthText(data.month)}
            labels={{ labelDayButton: value => {
              const iso = asDay(value)
              return `${iso === data.today ? 'Aujourd’hui, ' : ''}${dateLabel(iso, entries.get(iso))}`
            } }}
            formatters={{ formatWeekdayName: value => shortDays[(value.getUTCDay() + 6) % 7] }}
            onSelect={(value, _trigger, _modifiers, event) => select(value, event.detail > 0)} />
        </MonthEntries.Provider>
        {present.length > 0 && <ul className="planning-legend" aria-label="Légende du calendrier">
          {present.map(status => <li key={status}><PlanningStatus status={status} /></li>)}
        </ul>}
      </PlanningPeriod>
      <MonthDay day={selected} today={data.today} entry={sessions.find(entry => entry.day === selected)}
        activities={history.filter(activity => activity.day === selected)} />
    </div>}
  </>
}
