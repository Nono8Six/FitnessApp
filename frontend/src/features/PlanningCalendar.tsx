import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { cx, Row, Skeleton, StatusLabel, Tile } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { clock, dec2 } from '../lib/format'
import { href } from '../lib/router'
import { dayText, monthText, shiftDay, shiftMonth, useScheduleMonth, weekdayIndex, weekStart,
  type CalendarEntry, type EntryStatus } from '../lib/schedule'

export const shortDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
export const entryStatus: Record<EntryStatus, { label: string; tone: 'gray' | 'green' | 'orange' }> = {
  planned: { label: 'Prévue', tone: 'gray' },
  done: { label: 'Réalisée', tone: 'green' },
  shortened: { label: 'Écourtée', tone: 'orange' },
  missed: { label: 'Manquée', tone: 'gray' },
  in_progress: { label: 'En cours', tone: 'green' },
}
export const venueText = (venue: CalendarEntry['venue']) => venue === 'treadmill' ? 'Tapis' : 'Dehors'

export function PlanningToolbar({ view, title, weekHref, monthHref, todayHref, previous, next }: {
  view: 'week' | 'month'; title?: string; weekHref: string; monthHref: string; todayHref: string
  previous?: string; next?: string
}) {
  const period = view === 'week' ? 'Semaine' : 'Mois'
  return <div className="planning-toolbar">
    <div className="planning-controls">
      <nav className="planning-views" aria-label="Vue du planning">
        <a className="pressable" href={weekHref} aria-current={view === 'week' ? 'page' : undefined}>
          <CalendarRange size={16} aria-hidden />Semaine
        </a>
        <a className="pressable" href={monthHref} aria-current={view === 'month' ? 'page' : undefined}>
          <CalendarDays size={16} aria-hidden />Mois
        </a>
      </nav>
      <a className="planning-today pressable" href={todayHref} aria-label="Revenir à aujourd’hui">Aujourd’hui</a>
    </div>
    {title && <div className="planning-period">
      <h2 className="min-w-0 text-title2 first-letter:uppercase">{title}</h2>
      <div className="flex shrink-0 gap-1" aria-label={`Changer de ${period.toLowerCase()}`}>
        <a className="planning-arrow pressable" href={previous}
          aria-label={view === 'week' ? 'Semaine précédente' : 'Mois précédent'}><ChevronLeft size={21} aria-hidden /></a>
        <a className="planning-arrow pressable" href={next}
          aria-label={view === 'week' ? 'Semaine suivante' : 'Mois suivant'}><ChevronRight size={21} aria-hidden /></a>
      </div>
    </div>}
  </div>
}

export function PlanningDays({ days, sessions, selected, today, month, onSelect }: {
  days: (string | null)[]; sessions: CalendarEntry[]; selected: string; today: string; month?: boolean
  onSelect: (day: string, reveal: boolean) => void
}) {
  const byDay = new Map(sessions.map(item => [item.day, item]))
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -(index % 7), End: 6 - index % 7 }
    if (!Object.hasOwn(offsets, event.key)) return
    event.preventDefault()
    const target = index + offsets[event.key]
    const next = days[target]
    if (!next) return
    const grid = event.currentTarget.parentElement
    onSelect(next, false)
    grid?.querySelector<HTMLButtonElement>(`button[data-day="${next}"]`)?.focus()
  }
  return <div className={cx('planning-calendar', month && 'is-month')} aria-label={month ? 'Calendrier du mois' : 'Jours de la semaine'}>
    <div className="planning-weekdays" aria-hidden>{shortDays.map(label => <span key={label}>{label}</span>)}</div>
    <div className="planning-day-grid" role="group" aria-label="Choisir un jour">
      {days.map((day, index) => {
        if (!day) return <span key={`gap-${index}`} aria-hidden />
        const entry = byDay.get(day)
        return <button key={day} type="button" className="planning-day pressable" data-day={day}
          aria-current={day === today ? 'date' : undefined} aria-pressed={day === selected} tabIndex={day === selected ? 0 : -1}
          aria-label={`${dayText(day, true)}${entry ? `, ${entry.name}, ${entryStatus[entry.status].label}` : ', aucune séance prévue'}`}
          onClick={() => onSelect(day, true)} onKeyDown={event => move(event, index)}>
          <span className="planning-day-number num">{Number(day.slice(-2))}</span>
          <span className="planning-dot" data-status={entry?.status} aria-hidden />
          {month && entry && <span className="planning-day-name" aria-hidden>{entry.name}</span>}
        </button>
      })}
    </div>
  </div>
}

function MonthDay({ day, entry, today }: { day: string; entry?: CalendarEntry; today: string }) {
  const state = entry && entryStatus[entry.status]
  return <section id="planning-month-day" className="planning-month-detail" aria-label="Détail du jour" aria-live="polite">
    <div className="planning-detail-head">
      <h2 className="text-headline first-letter:uppercase">{dayText(day, true)}</h2>
      {day === today && <span className="text-footnote font-semibold text-accent">Aujourd’hui</span>}
    </div>
    {entry && state ? <div className="grid gap-2.5">
      <div>
        <p className="text-title2 wrap-anywhere">{entry.name}</p>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-footnote text-label-2">
          <span>{entry.minutes} min · {venueText(entry.venue)}</span>
          <StatusLabel tone={state.tone}>{state.label}</StatusLabel>
        </div>
      </div>
      <p className="text-subhead leading-relaxed text-label-2 wrap-anywhere">{entry.purpose}</p>
      {entry.report && entry.status !== 'in_progress' && <p className="text-footnote text-label-2">
        {clock(entry.report.active_s)} actives{entry.report.feeling != null && ` · Ressenti ${entry.report.feeling}/10`}
      </p>}
      {entry.manual && <p className="text-footnote text-label-2">
        Déclaré · {entry.manual.minutes} min{entry.manual.km != null && ` · ${dec2(entry.manual.km)} km`}
        {entry.manual.feeling != null && ` · Ressenti ${entry.manual.feeling}/10`}
      </p>}
      {entry.status === 'in_progress' ? <a className="planning-detail-link pressable" href={href.direct}>Revenir au Direct</a>
        : entry.report && <a className="planning-detail-link pressable" href={href.report(entry.report.id)}>Voir le bilan</a>}
    </div> : <p className="text-subhead text-label-2">Aucune séance prévue ce jour.</p>}
    <Row className="planning-open-week" title="Ouvrir cette semaine" href={href.planningWeek(weekStart(day), day)}
      leading={<Tile size={30}><CalendarRange size={16} aria-hidden /></Tile>} />
  </section>
}

export function MonthPlanning({ profile, month, day }: { profile: string; month?: string; day?: string }) {
  const { state, reload } = useScheduleMonth(profile, month)
  const [picked, setPicked] = useState(day)
  const data = state.status === 'ok' ? state.data : undefined
  const first = data && `${data.month}-01`
  const next = data && shiftMonth(data.month, 1)
  const last = next && shiftDay(`${next}-01`, -1)
  const selected = data && first && last
    ? picked && picked >= first && picked <= last ? picked : data.today.startsWith(data.month) ? data.today : data.sessions[0]?.day ?? first
    : undefined
  const days: (string | null)[] = first && last ? [
    ...Array<null>(weekdayIndex(first)).fill(null),
    ...Array.from({ length: Number(last.slice(-2)) }, (_, i) => shiftDay(first, i)),
  ] : []
  const statuses = data ? [...new Set(data.sessions.map(entry => entry.status))] : []
  const select = (date: string, reveal: boolean) => {
    setPicked(date)
    if (!reveal) return
    window.requestAnimationFrame(() => {
      const detail = document.getElementById('planning-month-day')
      const navigation = document.querySelector('.mobile-nav')
      const bottom = navigation?.getClientRects().length ? navigation.getBoundingClientRect().top : window.innerHeight
      if (detail && detail.getBoundingClientRect().bottom > bottom) detail.scrollIntoView({ block: 'end' })
    })
  }
  return <>
    <PlanningToolbar view="month" title={data && monthText(data.month)}
      weekHref={selected ? href.planningWeek(weekStart(selected), selected) : href.planning}
      monthHref={data ? href.planningMonth(data.month, selected) : href.planningMonth(month)}
      todayHref={data ? href.planningMonth(data.today.slice(0, 7), data.today) : href.planningMonth()}
      previous={data && href.planningMonth(shiftMonth(data.month, -1))}
      next={next ? href.planningMonth(next) : undefined} />
    {state.status === 'loading' && <Skeleton label="Chargement du mois" />}
    {state.status === 'error' && <WorkoutError message={state.message} retry={reload} />}
    {data && selected && <div className="planning-month-layout">
      <section className="planning-month-main" aria-label="Vue mensuelle">
        <PlanningDays days={days} selected={selected} today={data.today} sessions={data.sessions} month onSelect={select} />
        {statuses.length > 0 && <ul className="planning-legend" aria-label="Légende du calendrier">
          {statuses.map(value => <li key={value}><span className="planning-dot" data-status={value} aria-hidden />{entryStatus[value].label}</li>)}
        </ul>}
      </section>
      <MonthDay day={selected} today={data.today} entry={data.sessions.find(item => item.day === selected)} />
    </div>}
  </>
}
