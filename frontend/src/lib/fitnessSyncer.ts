import type { Recording } from './recordings'
import { workoutExport, workoutExportIssue } from './workoutExport.ts'

export const FITNESS_SYNCER_SIGN_IN = 'https://www.fitnesssyncer.com/sign-in'
export const FITNESS_SYNCER_NOTEBOOK = 'https://www.fitnesssyncer.com/notebook'
export const FITNESS_SYNCER_ACTIVITIES = [
  { value: 'Walking', label: 'Marche sur tapis' },
  { value: 'Running', label: 'Course sur tapis' },
] as const
export type FitnessSyncerActivity = typeof FITNESS_SYNCER_ACTIVITIES[number]['value']
export type FitnessSyncerCalorieChoice = 'single' | 'low' | 'high'
interface CalorieOption { value: FitnessSyncerCalorieChoice; label: string; kcal: number }

const nonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const movingPhases = new Set(['running', 'transitioning', 'adjusting', 'pausing', 'stopping'])

export function fitnessSyncerCalorieOptions(data: Recording): CalorieOption[] {
  const { coverage, energy } = data.metrics
  if (coverage.energy !== 1) return []
  if (!energy.movement_ambiguous) return nonNegative(energy.active_kcal)
    ? [{ value: 'single', label: 'Estimation', kcal: Math.round(energy.active_kcal) }] : []
  const low = energy.active_kcal_low, high = energy.active_kcal_high
  if (!nonNegative(low) || !nonNegative(high) || low > high) return []
  return [
    { value: 'low', label: 'Estimation basse', kcal: Math.round(low) },
    { value: 'high', label: 'Estimation haute', kcal: Math.round(high) },
  ]
}

/** Résumés mesurés ; les consignes du programme ne sont jamais des mesures. */
export function fitnessSyncerMeasurements(data: Recording) {
  const { coverage, speed_avg, incline_avg } = data.metrics
  const speedMax = data.samples.reduce<number | undefined>((max, sample) => {
    if (!movingPhases.has(sample.phase) || !nonNegative(sample.speed)) return max
    return max === undefined ? sample.speed : Math.max(max, sample.speed)
  }, undefined)
  return {
    speedAverage: coverage.speed === 1 && nonNegative(speed_avg) ? speed_avg : undefined,
    speedMax,
    inclineAverage: coverage.incline === 1 && nonNegative(incline_avg) ? incline_avg : undefined,
    feeling: nonNegative(data.feeling) && Number.isInteger(data.feeling) && data.feeling >= 1 && data.feeling <= 10 ? data.feeling : undefined,
  }
}

export interface FitnessSyncerDraft {
  activity: FitnessSyncerActivity
  title: string
  date: number
  duration: number
  distanceKM?: number
  calories: number
  speed_avg?: number
  speed_max?: number
  rpe?: number
  comment: string
}

export function fitnessSyncerExportIssue(data: Recording): string | null {
  const issue = workoutExportIssue(data)
  if (issue) return issue
  // Sans fuseau explicite, Date.parse dépend de l'appareil qui ouvre le bilan.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(data.started_at)) return 'Le fuseau horaire du départ est absent.'
  if (!Number.isFinite(data.metrics.pause_s) || data.metrics.pause_s < 0) return 'La durée des pauses est invalide.'
  if (!fitnessSyncerCalorieOptions(data).length) return 'Calories indisponibles ou incomplètes : cette séance ne peut pas être envoyée avec ses calories.'
  return null
}

/** Contrat officiel Notebook Editor Links. Toute plage calorique exige un choix explicite. */
export function fitnessSyncerDraft(data: Recording, activity: FitnessSyncerActivity, calorieChoice: FitnessSyncerCalorieChoice | null = null): FitnessSyncerDraft {
  const issue = fitnessSyncerExportIssue(data)
  if (issue) throw new Error(issue)
  const selected = FITNESS_SYNCER_ACTIVITIES.find(option => option.value === activity)
  if (!selected) throw new Error('Choisissez Marche ou Course.')
  const workout = workoutExport(data)
  const options = fitnessSyncerCalorieOptions(data)
  const calorie = options.find(option => option.value === (calorieChoice ?? (options.length === 1 ? options[0].value : null)))
  if (!calorie) throw new Error('Choisissez l’estimation calorique à transmettre.')
  const measurements = fitnessSyncerMeasurements(data)
  const { speedAverage, speedMax, inclineAverage, feeling } = measurements
  const pause = Math.round(data.metrics.pause_s)
  return {
    activity,
    title: `FitnessApp · ${selected.label}`,
    date: Date.parse(workout.debut),
    duration: workout.duree_secondes,
    ...(workout.distance_metres === undefined ? {} : { distanceKM: workout.distance_metres / 1000 }),
    calories: calorie.kcal,
    ...(speedAverage === undefined ? {} : { speed_avg: speedAverage / 3.6 }),
    ...(speedMax === undefined ? {} : { speed_max: speedMax / 3.6 }),
    ...(feeling === undefined ? {} : { rpe: feeling }),
    comment: `FitnessApp · référence ${workout.seance}. Départ ${workout.debut}. Durée active ${workout.duree_secondes} s.`
      + (pause > 0 ? ` Pauses exclues (${pause} s), chronologie non transmise.` : '')
      + ` Calories actives estimées, sans repos : ${calorie.kcal} kcal.`
      + (options.length > 1 ? ` Plage estimée ${options[0].kcal}–${options[1].kcal} kcal ; ${calorie.label.toLowerCase()} choisie, mouvement marche/course incertain.` : '')
      + (data.metrics.energy.outside_range ? ' Estimation hors du domaine usuel de la formule.' : '')
      + (speedAverage === undefined ? '' : ` Vitesse moyenne mesurée ${speedAverage} km/h.`)
      + (speedMax === undefined ? '' : ` Vitesse maximale des points mesurés ${speedMax} km/h.`)
      + (inclineAverage === undefined ? '' : ` Pente moyenne mesurée ${inclineAverage} % (sans altitude GPS).`)
      + (feeling === undefined ? '' : ` Effort ressenti ${feeling}/10.`)
      + ' Aucun pas, cardio ni GPS transmis. Courbes et événements non transmis.',
  }
}

export function fitnessSyncerUrl(draft: FitnessSyncerDraft): string {
  const url = new URL('https://www.fitnesssyncer.com/notebook-editor')
  const params = url.searchParams
  params.set('new', '')
  params.set('taskType', 'Activity')
  params.set('activity', draft.activity)
  params.set('title', draft.title)
  params.set('date', String(draft.date))
  params.set('duration', String(draft.duration))
  if (draft.distanceKM !== undefined) params.set('distanceKM', String(draft.distanceKM))
  params.set('calories', String(draft.calories))
  if (draft.speed_avg !== undefined) params.set('speed_avg', String(draft.speed_avg))
  if (draft.speed_max !== undefined) params.set('speed_max', String(draft.speed_max))
  if (draft.rpe !== undefined) params.set('rpe', String(draft.rpe))
  params.set('comment', draft.comment)
  return url.toString()
}
