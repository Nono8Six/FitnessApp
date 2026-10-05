import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorMessage, isRecord, type ValidationIssue } from './api'
import { loadProfiles } from './profiles'
import { useServer } from './server'
import type { Block, BlockKind } from './types'

export interface Step { kind: BlockKind; sec: number; speed: number; incline: number }
export interface Repeat { repeat: number; steps: Step[] }
export type Item = Step | Repeat
export type Goal = 'calories' | 'incline' | 'endurance'
export type Level = 'easy' | 'intermediate' | 'hard'
export const GOALS: Record<Goal, string> = { calories: 'Dépense calorique', incline: 'Jambes et fessiers — marche inclinée', endurance: 'Endurance' }
/** Libellés courts des capsules de filtre ; les titres de section gardent le nom complet. */
export const GOAL_SHORT: Record<Goal, string> = { calories: 'Calories', incline: 'Marche inclinée', endurance: 'Endurance' }
export const LEVELS: Record<Level, string> = { easy: 'Facile', intermediate: 'Intermédiaire', hard: 'Soutenu' }
export interface WorkoutInput { name: string; items: Item[]; goal?: Goal | null; level?: Level | null }
export interface Energy { active_kcal: number | null; total_kcal: number | null; weight_kg: number | null; automatic_gait: boolean; outside_range: boolean }
export interface Preview { blocks: Block[]; summary: { sec: number; km: number; count: number; minSpeed: number; maxSpeed: number; ascent_m: number; energy: Energy } }
export interface Workout extends WorkoutInput, Preview {
  id: string; version: number; author: 'human' | 'chatgpt'; author_name: string; created_at: string
  origin: { kind: 'catalog' | 'chatgpt'; template_id?: string; level?: Level; target?: CatalogTarget; catalog_revision?: string; conversation_id?: string; turn_id?: string; proposal_id?: string } | null
}
export interface CatalogWorkout extends WorkoutInput, Preview { template_id: string; description: string; goal: Goal; level: Level }
export interface CatalogTarget { duration_sec?: number; active_kcal?: number }
export interface CatalogMethod {
  purpose: string; structure: string; adaptation: string; effort: string; limits: string
  sources: { title: string; url: string }[]
  dose: { work_sec: number; recovery_sec: number; easy_sec: number; cycles: number; work_limit_sec: number } | null
}
export interface CatalogOption {
  template_id: string; name: string; description: string; goal: Goal; level: Level
  weight_kg: number | null; method: CatalogMethod; workout: CatalogWorkout | null; message: string | null
}
export const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('')
export interface LibraryData { workouts: Workout[]; selected_id: string | null }

export const KIND_LABEL: Record<BlockKind, string> = {
  warmup: 'Échauffement', steady: 'Allure continue', run: 'Course', recover: 'Récupération', cooldown: 'Retour au calme',
}
export const isRepeat = (item: Item): item is Repeat => 'repeat' in item
/** Blocs d'effort en accent, blocs faciles en gris (DESIGN.md). */
export const isHard = (kind: BlockKind) => kind === 'run' || kind === 'steady'
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
const isDose = (v: unknown): v is NonNullable<CatalogMethod['dose']> => isRecord(v)
  && ['work_sec', 'recovery_sec', 'easy_sec', 'cycles', 'work_limit_sec'].every(k => Number.isInteger(v[k]) && Number(v[k]) >= 0)
const isCatalogMethod = (v: unknown): v is CatalogMethod => isRecord(v)
  && ['purpose', 'structure', 'adaptation', 'effort', 'limits'].every(k => typeof v[k] === 'string')
  && (v.dose === null || isDose(v.dose))
  && Array.isArray(v.sources) && v.sources.length > 0 && v.sources.every(s => isRecord(s)
    && typeof s.title === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url))
export const isWorkoutInput = (v: unknown): v is WorkoutInput => isRecord(v) && typeof v.name === 'string'
  && Array.isArray(v.items) && v.items.every(isItem)
  && (v.goal === null || v.goal === undefined || Object.hasOwn(GOALS, String(v.goal)))
  && (v.level === null || v.level === undefined || Object.hasOwn(LEVELS, String(v.level)))
export const workoutUrl = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/workouts`
export const previewCatalog = (profile: string, target: CatalogTarget) => api(`${workoutUrl(profile)}/catalog/preview`, {
  method: 'POST', body: target,
  validate: (v): v is CatalogOption[] => Array.isArray(v) && v.length > 0 && v.every(w => isRecord(w)
    && typeof w.template_id === 'string' && typeof w.name === 'string' && typeof w.description === 'string'
    && Object.hasOwn(GOALS, String(w.goal)) && Object.hasOwn(LEVELS, String(w.level))
    && isCatalogMethod(w.method)
    && (w.weight_kg === null || finite(w.weight_kg))
    && ((w.workout === null && w.method.dose === null && typeof w.message === 'string')
      || (isPreview(w.workout) && isWorkoutInput(w.workout) && isRecord(w.workout)
        && w.method.dose !== null && w.method.dose.work_sec <= w.method.dose.work_limit_sec
        && w.method.dose.work_sec + w.method.dose.recovery_sec + w.method.dose.easy_sec + 600 === w.workout.summary.sec
        && w.workout.template_id === w.template_id && w.workout.level === w.level && w.workout.goal === w.goal
        && w.workout.description === w.description && w.message === null))),
})
export const addCatalog = (profile: string, data: CatalogWorkout, target: CatalogTarget = {}) => api(`${workoutUrl(profile)}/catalog`, {
  method: 'POST', body: { template_id: data.template_id, level: data.level, target }, validate: isWorkout,
})
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
