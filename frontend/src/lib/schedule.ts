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
export interface PlanEntry extends SessionSpec {
  id: string
  status: EntryStatus
  workout: Workout | null
  report: { id: string; active_s: number; feeling: number | null } | null
  manual?: ManualReport
}
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
const isEntry = (v: unknown): v is PlanEntry => isRecord(v) && isSession(v) && typeof v.id === 'string'
  && ['planned', 'done', 'shortened', 'missed', 'in_progress'].includes(String(v.status))
  && (v.workout === null || isWorkout(v.workout))
  && (v.report === null || isRecord(v.report) && typeof v.report.id === 'string' && typeof v.report.active_s === 'number')
  && (v.manual === undefined || isRecord(v.manual) && typeof v.manual.minutes === 'number')
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
  && (v.proposal === null || isDraft(v.proposal))

const path = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/schedule`
export const readSchedule = (profile: string, week?: string) =>
  api(`${path(profile)}${week ? `?week=${encodeURIComponent(week)}` : ''}`, { validate: isSchedule })
export const suggestSchedule = (profile: string, body: ScheduleRequest) =>
  api(`${path(profile)}/suggest`, { method: 'POST', body, validate: isDraft, timeout: 114_000 })
export const acceptSchedule = (profile: string, week: string, id: string, placements: { slot: number; day: string }[]) =>
  api(`${path(profile)}/${week}/accept`, { method: 'POST', body: { id, placements }, validate: isSchedule, timeout: 12_000 })
export const saveOutdoor = (profile: string, week: string, id: string, revision: number, values: ManualReport) =>
  api(`${path(profile)}/${week}/outdoor/${id}`, { method: 'PATCH', body: { ...values, revision }, validate: isSchedule })

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: Schedule }
export function useSchedule(profile: string, week?: string) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    const load = () => {
      const generation = ++revision.current
      readSchedule(profile, week)
        .then(data => { if (active && generation === revision.current) setState({ status: 'ok', data }) })
        .catch(err => { if (active && generation === revision.current) setState({ status: 'error', message: errorMessage(err) }) })
    }
    const visibility = () => { if (document.visibilityState === 'visible') load() }
    load()
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; document.removeEventListener('visibilitychange', visibility) }
  }, [profile, week, attempt])
  return {
    state,
    reload: () => { setState({ status: 'loading' }); setAttempt(n => n + 1) },
    update: (data: Schedule) => { revision.current++; setState({ status: 'ok', data }) },
  }
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
export const dayText = (day: string, weekday = false) => (weekday ? weekdayFormatter : dayFormatter).format(new Date(day))
export function shiftDay(day: string, amount: number) {
  const value = new Date(day)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
