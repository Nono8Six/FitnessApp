import type { Recording } from './recordings'

export const APPLE_SHORTCUT_NAME = 'Fitness vers Santé'

/** Contrat du raccourci v1. Aucun poids, profil, identifiant de compte ni courbe. */
export interface AppleWorkout {
  version: 1
  seance: string
  debut: string
  duree_secondes: number
  distance_metres?: number
  calories_actives?: number
}

const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function appleExportIssue(data: Recording): string | null {
  if (data.mode !== 'reel') return 'Les séances simulées ne sont pas envoyées dans Santé.'
  if (!data.closed || !['completed', 'stopped'].includes(data.phase) || !data.checkpoint.stop_confirmed)
    return 'Disponible pour une séance clôturée avec arrêt confirmé.'
  if (data.lost_entries !== 0) return 'Des données ont été perdues : cette séance ne peut pas être envoyée.'
  if (!nonNegative(data.metrics.active_s) || Math.round(data.metrics.active_s) < 1)
    return 'Aucune durée active à envoyer.'
  if (!Number.isFinite(Date.parse(data.started_at))) return 'La date de départ est invalide.'
  return null
}

export function appleWorkout(data: Recording): AppleWorkout {
  const issue = appleExportIssue(data)
  if (issue) throw new Error(issue)
  const m = data.metrics
  return {
    version: 1,
    seance: data.id,
    debut: new Date(data.started_at).toISOString(),
    duree_secondes: Math.round(m.active_s),
    ...(m.distance_quality === 'complete' && nonNegative(m.distance_m) ? { distance_metres: m.distance_m } : {}),
    // Un intervalle marche/course n'est pas une valeur unique. Ne pas prendre
    // sa moyenne, ni recalculer les calories à partir du type choisi à l'export.
    ...(m.coverage.energy === 1 && !m.energy.movement_ambiguous && nonNegative(m.energy.active_kcal)
      ? { calories_actives: m.energy.active_kcal } : {}),
  }
}

export function appleShortcutUrl(workout: AppleWorkout): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(APPLE_SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(JSON.stringify(workout))}`
}
