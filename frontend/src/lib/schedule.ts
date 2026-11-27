import { useEffect, useRef, useState } from 'react'
import { api, errorMessage, isRecord } from './api'
import { isWorkout, type Workout } from './workouts'

export type Venue = 'treadmill' | 'outdoor'
export interface Availability { weekdays: number[]; minutes: number; venue: Venue | 'both'; baseline: string }
export interface ScheduleRequest { week: string; availability: Availability; note: string; report_id?: string }
export interface SchedulePhase { until: string; focus: string }
export interface SessionSpec { day: string; name: string; minutes: number; purpose: string; effort: number; venue: Venue }
export interface ManualReport { minutes: number; km: number | null; feeling: number | null }
export type EntryStatus = 'planned' | 'done' | 'shortened' | 'missed' | 'in_progress'
export interface CalendarEntry extends SessionSpec {
  id: string
  status: EntryStatus
  report: { id: string; active_s: number; feeling: number | null } | null
  manual?: ManualReport
}
export interface PlanEntry extends CalendarEntry { workout: Workout | null }
export type CalendarItem = Pick<CalendarEntry, 'id' | 'day' | 'name' | 'status'>
export interface CalendarActivity extends CalendarItem {
  status: 'done' | 'shortened'
  time: string
  active_s: number
  feeling: number | null
}
export interface ScheduleMonth { month: string; today: string; sessions: CalendarEntry[]; history: CalendarActivity[] }
export interface PlanDraft {
  id: string
  allowed: string[]
  request: ScheduleRequest
  replaces: SessionSpec[]
  data: { focus: string; explanation: string; phases: SchedulePhase[]; sessions: SessionSpec[] }
}
export interface Schedule {
  week: string
  today: string
  revision: number
  goal: { description: string; milestone: string; target_date: string | null; revision: number } | null
  available: Availability | null
  plan: { focus: string; explanation: string; phases: SchedulePhase[]; sessions: PlanEntry[]; goal_revision: number } | null
  proposal: PlanDraft | null
  history: CalendarActivity[]
}

const hasDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isAvailability = (v: unknown): v is Availability => isRecord(v) && Array.isArray(v.weekdays)
  && v.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
  && Number.isInteger(v.minutes) && ['treadmill', 'outdoor', 'both'].includes(String(v.venue)) && typeof v.baseline === 'string'
const isSession = (v: unknown): v is SessionSpec => isRecord(v) && hasDay(v.day) && typeof v.name === 'string'
  && typeof v.purpose === 'string' && Number.isInteger(v.minutes) && Number.isInteger(v.effort)
  && (v.venue === 'treadmill' || v.venue === 'outdoor')
const isPhase = (v: unknown): v is SchedulePhase => isRecord(v) && hasDay(v.until) && typeof v.focus === 'string'
const isPlan = (v: unknown) => isRecord(v) && typeof v.focus === 'string' && typeof v.explanation === 'string'
  && Array.isArray(v.phases) && v.phases.every(isPhase) && Array.isArray(v.sessions)
const isCalendarEntry = (v: unknown): v is CalendarEntry => isRecord(v) && isSession(v) && typeof v.id === 'string'
  && ['planned', 'done', 'shortened', 'missed', 'in_progress'].includes(String(v.status))
  && (v.report === null || isRecord(v.report) && typeof v.report.id === 'string' && typeof v.report.active_s === 'number')
  && (v.manual === undefined || isRecord(v.manual) && typeof v.manual.minutes === 'number')
const isEntry = (v: unknown): v is PlanEntry => isRecord(v) && isCalendarEntry(v) && (v.workout === null || isWorkout(v.workout))
const hasHistory = (v: Record<string, unknown>) => Array.isArray(v.history)
  && v.history.every(item => isRecord(item) && hasDay(item.day) && typeof item.id === 'string' && typeof item.name === 'string'
    && (item.status === 'done' || item.status === 'shortened') && typeof item.active_s === 'number'
    && typeof item.time === 'string' && (item.feeling === null || typeof item.feeling === 'number'))
const isMonth = (v: unknown): v is ScheduleMonth => isRecord(v) && hasDay(v.today) && typeof v.month === 'string'
  && /^\d{4}-\d{2}$/.test(v.month) && Array.isArray(v.sessions) && v.sessions.every(isCalendarEntry) && hasHistory(v)
const isDraft = (v: unknown): v is PlanDraft => isRecord(v) && typeof v.id === 'string' && Array.isArray(v.allowed)
  && v.allowed.every(hasDay) && Array.isArray(v.replaces) && v.replaces.every(isSession)
  && isRecord(v.request) && isAvailability(v.request.availability) && isPlan(v.data) && isRecord(v.data)
  && Array.isArray(v.data.sessions) && v.data.sessions.every(isSession)
const isSchedule = (v: unknown): v is Schedule => isRecord(v) && hasDay(v.week) && hasDay(v.today)
  && Number.isInteger(v.revision) && (v.goal === null || isRecord(v.goal) && typeof v.goal.description === 'string'
    && typeof v.goal.milestone === 'string' && (v.goal.target_date === null || hasDay(v.goal.target_date)) && Number.isInteger(v.goal.revision))
  && (v.available === null || isAvailability(v.available))
  && (v.plan === null || isPlan(v.plan) && isRecord(v.plan) && Array.isArray(v.plan.sessions)
    && v.plan.sessions.every(isEntry) && Number.isInteger(v.plan.goal_revision))
  && (v.proposal === null || isDraft(v.proposal)) && hasHistory(v)

const path = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/schedule`
export const readSchedule = (profile: string, week?: string) =>
  api(`${path(profile)}${week ? `?week=${encodeURIComponent(week)}` : ''}`, { validate: isSchedule })
export const readScheduleMonth = (profile: string, month?: string) =>
  api(`${path(profile)}/month${month ? `?month=${encodeURIComponent(month)}` : ''}`, { validate: isMonth })
export const suggestSchedule = (profile: string, body: ScheduleRequest) =>
  api(`${path(profile)}/suggest`, { method: 'POST', body, validate: isDraft, timeout: 114_000 })
export const acceptSchedule = (profile: string, week: string, id: string, placements: { slot: number; day: string }[]) =>
  api(`${path(profile)}/${week}/accept`, { method: 'POST', body: { id, placements }, validate: isSchedule, timeout: 12_000 })
export const saveOutdoor = (profile: string, week: string, id: string, revision: number, values: ManualReport) =>
  api(`${path(profile)}/${week}/outdoor/${id}`, { method: 'PATCH', body: { ...values, revision }, validate: isSchedule })

type State<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T }
function useScheduleRead<T>(profile: string, period: string | undefined, read: (profile: string, period?: string) => Promise<T>) {
  const [state, setState] = useState<State<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    const load = () => {
      const generation = ++revision.current
      read(profile, period)
        .then(data => { if (active && generation === revision.current) setState({ status: 'ok', data }) })
        .catch(err => { if (active && generation === revision.current) setState({ status: 'error', message: errorMessage(err) }) })
    }
    const visibility = () => { if (document.visibilityState === 'visible') load() }
    load()
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; document.removeEventListener('visibilitychange', visibility) }
  }, [profile, period, attempt, read])
  return {
    state,
    reload: () => { setState({ status: 'loading' }); setAttempt(n => n + 1) },
    update: (data: T) => { revision.current++; setState({ status: 'ok', data }) },
  }
}

export const useSchedule = (profile: string, week?: string) => useScheduleRead(profile, week, readSchedule)
export const useScheduleMonth = (profile: string, month?: string) => useScheduleRead(profile, month, readScheduleMonth)

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const dayText = (day: string, weekday = false) => (weekday ? weekdayFormatter : dayFormatter).format(new Date(day))
export const monthText = (month: string) => monthFormatter.format(new Date(`${month}-01`))
export function shiftDay(day: string, amount: number) {
  const value = new Date(day)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

export function shiftMonth(month: string, amount: number) {
  const value = new Date(`${month}-01`)
  value.setUTCMonth(value.getUTCMonth() + amount)
  return value.toISOString().slice(0, 7)
}

export const weekdayIndex = (day: string) => (new Date(day).getUTCDay() + 6) % 7
export const weekStart = (day: string) => shiftDay(day, -weekdayIndex(day))

export function calendarByDay(items: CalendarItem[]) {
  const groups = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const day = groups.get(item.day)
    if (day) day.push(item)
    else groups.set(item.day, [item])
  }
  // Le repère du jour montre en priorité une séance effectivement réalisée.
  const trained = (item: CalendarItem) => Number(item.status === 'done' || item.status === 'shortened')
  for (const day of groups.values()) day.sort((a, b) => trained(b) - trained(a))
  return groups
}
