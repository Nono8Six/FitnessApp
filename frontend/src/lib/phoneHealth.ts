import type { Recording } from './recordings'
import { fitnessSyncerCalorieOptions, fitnessSyncerDraft, type FitnessSyncerActivity } from './fitnessSyncer.ts'
import { workoutExport } from './workoutExport.ts'

export type PhoneSystem = 'android' | 'iphone'
export interface PhoneSetup {
  system: PhoneSystem
  profile: string
  name: string
  activity: FitnessSyncerActivity
  calories: 'low' | 'high'
  token: string
}

export const phoneSetupKey = 'fitness.health.phone.v1'
export const phoneAttemptKey = (profile: string, id: string) => `fitness.health.request:${profile}:${id}`
export const shortcutName = (activity: FitnessSyncerActivity) => activity === 'Running' ? 'FitnessApp Course' : 'FitnessApp Marche'

export function detectPhone(userAgent: string, platform: string, touches: number): PhoneSystem | null {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && touches > 1)) return 'iphone'
  return null
}

export function readPhoneSetup(): PhoneSetup | null {
  const raw = localStorage.getItem(phoneSetupKey)
  if (!raw) return null
  const s = JSON.parse(raw) as PhoneSetup | null
  if (!s || !['android', 'iphone'].includes(s.system) || !['Running', 'Walking'].includes(s.activity)
    || !['low', 'high'].includes(s.calories) || typeof s.profile !== 'string' || !s.profile
    || typeof s.name !== 'string' || typeof s.token !== 'string' || !/^[0-9a-f]{64}$/.test(s.token)) {
    throw new Error('La configuration Santé de ce navigateur doit être renouvelée.')
  }
  return s
}

export function makePhoneWorkout(data: Recording, setup: PhoneSetup) {
  if (data.profile.id !== setup.profile) throw new Error('Cette séance appartient à un autre profil.')
  const options = fitnessSyncerCalorieOptions(data)
  const draft = fitnessSyncerDraft(data, setup.activity, options.length === 1 ? 'single' : setup.calories)
  return {
    ...workoutExport(data),
    activite: draft.activity,
    calories_actives: draft.calories,
    note: draft.comment,
  }
}

export function phoneSaveUrl(data: Recording, setup: PhoneSetup, origin: string) {
  const workout = makePhoneWorkout(data, setup)
  if (setup.system === 'iphone') {
    const { debut, duree_secondes, distance_metres, calories_actives } = workout
    const input = encodeURIComponent(JSON.stringify({ debut, duree_secondes, distance_metres, calories_actives }))
    return `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName(setup.activity))}&input=text&text=${input}`
  }
  const payload = encodeURIComponent(JSON.stringify({ ...workout, profil: data.profile.id, nom: data.profile.name }))
  // Chrome addresses the installed package explicitly. The pairing secret stays on this phone.
  return 'intent://save#Intent;scheme=fitnessappsante;package=fr.fitnessapp.sante'
    + `;S.pair=${setup.token};S.workout=${payload};S.browser_fallback_url=${encodeURIComponent(origin + '/#/reglages')};end`
}
