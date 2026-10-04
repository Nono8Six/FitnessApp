import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorMessage, isRecord, type ValidationIssue } from './api'
import { loadProfiles } from './profiles'
import { useServer } from './server'
import type { Block, BlockKind } from './types'

export interface Step { kind: BlockKind; sec: number; speed: number; incline: number }
export interface Repeat { repeat: number; steps: Step[] }
export type Item = Step | Repeat
export interface WorkoutInput { name: string; items: Item[] }
export interface Energy { active_kcal: number | null; total_kcal: number | null; weight_kg: number | null; automatic_gait: boolean; outside_range: boolean }
export interface Preview { blocks: Block[]; summary: { sec: number; km: number; count: number; minSpeed: number; maxSpeed: number; ascent_m: number; energy: Energy } }
export interface Workout extends WorkoutInput, Preview {
  id: string; version: number; author: 'human' | 'chatgpt'; author_name: string; created_at: string
}
export interface LibraryData { workouts: Workout[]; selected_id: string | null }

export const KIND_LABEL: Record<BlockKind, string> = {
  warmup: 'Échauffement', steady: 'Allure continue', run: 'Course', recover: 'Récupération', cooldown: 'Retour au calme',
}
export const isRepeat = (item: Item): item is Repeat => 'repeat' in item
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isEnergy = (v: unknown): v is Energy => isRecord(v)
  && typeof v.automatic_gait === 'boolean' && typeof v.outside_range === 'boolean'
  && ((v.weight_kg === null && v.active_kcal === null && v.total_kcal === null)
    || (finite(v.weight_kg) && finite(v.active_kcal) && finite(v.total_kcal)))
const isStep = (v: unknown): v is Step => isRecord(v) && typeof v.kind === 'string' && Object.hasOwn(KIND_LABEL, v.kind)
  && finite(v.sec) && finite(v.speed) && finite(v.incline)
const isItem = (v: unknown): v is Item => isStep(v) || (isRecord(v) && Number.isInteger(v.repeat)
  && Array.isArray(v.steps) && v.steps.length > 0 && v.steps.every(isStep))
export const isPreview = (v: unknown): v is Preview => isRecord(v) && Array.isArray(v.blocks) && v.blocks.length > 0
  && v.blocks.every((b: unknown) => isStep(b) && isRecord(b) && finite(b.index) && finite(b.start) && finite(b.end) && typeof b.label === 'string')
  && isRecord(v.summary) && ['sec', 'km', 'count', 'minSpeed', 'maxSpeed', 'ascent_m'].every(k => finite((v.summary as Record<string, unknown>)[k]))
  && isEnergy(v.summary.energy)
export const isWorkout = (v: unknown): v is Workout => isPreview(v) && isRecord(v)
  && typeof v.id === 'string' && typeof v.name === 'string' && Number.isInteger(v.version)
  && (v.author === 'human' || v.author === 'chatgpt') && typeof v.author_name === 'string'
  && typeof v.created_at === 'string' && Array.isArray(v.items) && v.items.every(isItem)
const isLibrary = (v: unknown): v is LibraryData => isRecord(v) && Array.isArray(v.workouts)
  && v.workouts.every(isWorkout) && (v.selected_id === null || typeof v.selected_id === 'string')
const isSelection = (v: unknown): v is { selected_id: string | null } => isRecord(v) && (v.selected_id === null || typeof v.selected_id === 'string')
export const workoutUrl = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/workouts`
export const readWorkout = (profile: string, id: string) => api(`${workoutUrl(profile)}/${encodeURIComponent(id)}`, { validate: isWorkout })
export const readVersions = (profile: string, id: string) => api(`${workoutUrl(profile)}/${encodeURIComponent(id)}/versions`, {
  validate: (v): v is Workout[] => Array.isArray(v) && v.every(isWorkout),
})
export const saveWorkout = (profile: string, data: WorkoutInput, source?: Workout) => api(
  source ? `${workoutUrl(profile)}/${source.id}` : workoutUrl(profile), {
    method: source ? 'PATCH' : 'POST', body: source ? { ...data, base_version: source.version } : data, validate: isWorkout,
  })
export const selectWorkout = (profile: string, id: string | null) => api(`${workoutUrl(profile)}/selection`, {
  method: 'PATCH', body: { workout_id: id }, validate: isSelection,
})
export const duplicateWorkout = (profile: string, id: string) => api(`${workoutUrl(profile)}/${id}/duplicate`, { method: 'POST', validate: isWorkout })
export const deleteWorkout = (profile: string, id: string) => api(`${workoutUrl(profile)}/${id}`, {
  method: 'DELETE', validate: (v): v is { deleted: true } => isRecord(v) && v.deleted === true,
})

export type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string; issues?: ValidationIssue[] } | { status: 'ok'; data: T }

/** Les lectures anciennes ne peuvent pas remplacer le résultat d'une nouvelle lecture. */
export function useLibrary(profile: string) {
  const [state, setState] = useState<LoadState<LibraryData>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const server = useServer().status
  const reload = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api(workoutUrl(profile), { validate: isLibrary }).then(data => {
      if (active) setState({ status: 'ok', data })
    }).catch(error => {
      if (!active) return
      console.warn('Fitness : lecture des séances impossible', error)
      setState({ status: 'error', message: errorMessage(error) })
      if (error instanceof ApiError && error.status === 404) void loadProfiles()
    })
    return () => { active = false }
  }, [profile, revision, server])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', visible) }
  }, [reload])
  return { state, reload }
}

/** Les calculs affichés sont ceux du serveur, jamais un second calcul en JavaScript. */
export function usePreview(profile: string, input: WorkoutInput) {
  const payload = JSON.stringify(input)
  const [result, setResult] = useState<{ payload: string; state: LoadState<Preview> }>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      api(`${workoutUrl(profile)}/preview`, { method: 'POST', body: JSON.parse(payload), validate: isPreview })
        .then(data => { if (active) setResult({ payload, state: { status: 'ok', data } }) })
        .catch(error => {
          if (!active) return
          if (!(error instanceof ApiError) || error.status !== 422) console.warn('Fitness : aperçu impossible', error)
          setResult({ payload, state: { status: 'error', message: errorMessage(error), issues: error instanceof ApiError ? error.issues : undefined } })
        })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [payload, profile, revision])
  return { state: result?.payload === payload ? result.state : { status: 'loading' } as LoadState<Preview>,
    retry: () => { setResult(undefined); setRevision(v => v + 1) } }
}
