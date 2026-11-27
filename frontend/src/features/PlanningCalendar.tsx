import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Footprints, Minus, Play, Route, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { clock } from '../lib/format'
import { dayText, calendarByDay, type CalendarActivity, type CalendarEntry, type CalendarItem, type EntryStatus } from '../lib/schedule'

export const shortDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
export const statuses = {
  planned: { label: 'Prévue', Icon: Minus },
  done: { label: 'Réalisée', Icon: Check },
  shortened: { label: 'Écourtée', Icon: Clock3 },
  missed: { label: 'Manquée', Icon: X },
  in_progress: { label: 'En cours', Icon: Play },
} satisfies Record<EntryStatus, { label: string; Icon: typeof Check }>

export function PlanningStatus({ status }: { status: EntryStatus }) {
  return <span className="planning-status" data-status={status}>
    <StatusMark status={status} />{statuses[status].label}
  </span>
}

function StatusMark({ status }: { status?: EntryStatus }) {
  const Icon = status && statuses[status].Icon
  return <span className="planning-mark" data-status={status} aria-hidden>
    {Icon && <Icon size={10} strokeWidth={2.6} />}
  </span>
}

export function CalendarMarks({ entries }: { entries: CalendarItem[] }) {
  return <span className="planning-calendar-marks" aria-hidden>
    <StatusMark status={entries[0]?.status} />
    {entries.length > 1 && <span className="planning-calendar-count">+{entries.length - 1}</span>}
  </span>
}

export function ActivityMeta({ activity }: { activity: CalendarActivity }) {
  return <span className="planning-meta">
    <span className="text-yellow num"><span className="sr-only">Durée </span>{clock(activity.active_s)}</span>
    <span className="num">à {activity.time}</span>
    <PlanningStatus status={activity.status} />
  </span>
}

export const venueText = (venue: CalendarEntry['venue']) => venue === 'treadmill' ? 'Tapis' : 'Dehors'
export const VenueIcon = ({ venue, size = 17 }: { venue: CalendarEntry['venue']; size?: number }) =>
  venue === 'treadmill' ? <Footprints size={size} aria-hidden /> : <Route size={size} aria-hidden />

export function revealPlanningItem(element: HTMLElement | null, block: ScrollLogicalPosition) {
  if (!element) return
  const navigation = document.querySelector('.mobile-nav')
  const rect = element.getBoundingClientRect()
  const bottom = navigation?.getClientRects().length ? navigation.getBoundingClientRect().top : window.innerHeight
  if (rect.top < 0 || rect.bottom + 8 > bottom) element.scrollIntoView({ block: rect.height > bottom - 56 ? 'start' : block })
}

export function PlanningViews({ view, weekHref, monthHref, todayHref, onToday }: {
  view: 'week' | 'month'; weekHref: string; monthHref: string; todayHref: string; onToday?: () => void
}) {
  return <div className="planning-controls">
    <nav className="planning-views" aria-label="Vue du planning">
      <a className="pressable" href={weekHref} aria-current={view === 'week' ? 'page' : undefined}
        onClick={view === 'week' ? event => event.preventDefault() : undefined}>Semaine</a>
      <a className="pressable" href={monthHref} aria-current={view === 'month' ? 'page' : undefined}
        onClick={view === 'month' ? event => event.preventDefault() : undefined}>Mois</a>
    </nav>
    <a className="planning-today pressable" href={todayHref} onClick={onToday} aria-label="Revenir à aujourd’hui">
      <CalendarDays size={16} aria-hidden />Aujourd’hui
    </a>
  </div>
}

export function PlanningPeriod({ title, subtitle, previous, next, period, children }: {
  title: string; subtitle: string; previous?: string; next?: string; period: 'semaine' | 'mois'; children: ReactNode
}) {
  return <section className="planning-period-card" aria-label={period === 'semaine' ? 'Calendrier de la semaine' : 'Calendrier du mois'}>
    <div className="planning-period">
      <div className="min-w-0">
        <h2 className="planning-period-title first-letter:uppercase">{title}</h2>
        <p className="planning-period-subtitle">{subtitle}</p>
      </div>
      <nav className="planning-period-nav" aria-label={`Changer de ${period}`}>
        <a className="planning-arrow pressable" href={previous} aria-disabled={!previous || undefined}
          aria-label={period === 'semaine' ? 'Semaine précédente' : 'Mois précédent'}><ChevronLeft size={20} aria-hidden /></a>
        <a className="planning-arrow pressable" href={next} aria-disabled={!next || undefined}
          aria-label={period === 'semaine' ? 'Semaine suivante' : 'Mois suivant'}><ChevronRight size={20} aria-hidden /></a>
      </nav>
    </div>
    {children}
  </section>
}

export const dateLabel = (day: string, entries: CalendarItem[] = []) => entries.length
  ? `${dayText(day, true)}, ${entries.map(entry => `${entry.name}, ${statuses[entry.status].label}`).join('. ')}`
  : `${dayText(day, true)}, aucune séance`

export function WeekDays({ days, sessions, selected, today, onSelect }: {
  days: string[]; sessions: CalendarItem[]; selected: string; today: string; onSelect: (day: string, reveal: boolean) => void
}) {
  const byDay = calendarByDay(sessions)
  return <div className="planning-week-days" role="group" aria-label="Choisir un jour de la semaine">
    {days.map((day, index) => {
      const entries = byDay.get(day) ?? []
      return <button key={day} type="button" className="planning-week-day pressable" data-day={day} data-status={entries[0]?.status}
        aria-current={day === today ? 'date' : undefined} aria-pressed={day === selected} tabIndex={day === selected ? 0 : -1}
        aria-label={dateLabel(day, entries)} onClick={() => onSelect(day, true)}
        onKeyDown={event => {
          const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: 6 }[event.key]
          const next = target === undefined ? undefined : days[target]
          if (!next) return
          event.preventDefault()
          onSelect(next, false)
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()
        }}>
        <span className="planning-week-day-inner" aria-hidden>
          <span>{shortDays[index]}</span>
          <span className="planning-date num">{Number(day.slice(-2))}</span>
          <CalendarMarks entries={entries} />
        </span>
      </button>
    })}
  </div>
}
