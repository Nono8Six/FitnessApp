import { api, isRecord } from './api'

export interface GoalDraft {
  description: string
  target_date: string | null
}

export interface TrainingGoal extends GoalDraft {
  milestone: string
  revision: number
}

export interface GoalAdvice {
  milestone: string
  question: string | null
}

function isGoal(value: unknown): value is TrainingGoal {
  return isRecord(value) && typeof value.description === 'string' && typeof value.milestone === 'string'
    && (value.target_date === null || typeof value.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.target_date))
    && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0
}

function isAdvice(value: unknown): value is GoalAdvice {
  return isRecord(value) && typeof value.milestone === 'string'
    && (value.question === null || typeof value.question === 'string')
}

const goalUrl = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/goal`
const isGoalOrEmpty = (value: unknown): value is TrainingGoal | null => value === null || isGoal(value)

export const readGoal = (profile: string) => api(goalUrl(profile), { validate: isGoalOrEmpty })
export const saveGoal = (profile: string, body: TrainingGoal) =>
  api(goalUrl(profile), { method: 'PATCH', body, validate: isGoal })
export const suggestGoal = (profile: string, body: GoalDraft & { clarification?: string }) =>
  api(`${goalUrl(profile)}/suggest`, { method: 'POST', body, validate: isAdvice, timeout: 50_000 })
