import { useSyncExternalStore } from 'react'
import { api, ApiError, errorMessage, isRecord } from './api'

/** Profil du serveur. Le choix du profil n’est pas une authentification. */
export interface Profile {
  id: string
  name: string
  weekly_goal: number
  speed_unit: SpeedUnit
  weight_kg: number | null
  created_at: string
  updated_at: string
}

export type SpeedUnit = 'kmh' | 'pace'
export type ProfileChanges = Partial<Pick<Profile, 'name' | 'weekly_goal' | 'speed_unit' | 'weight_kg'>>

export const WEEKLY_GOAL_MIN = 1
export const WEEKLY_GOAL_MAX = 14
export const NAME_MAX = 40

export type ProfilesState =
  | { status: 'loading' }
  | { status: 'ok'; profiles: Profile[] }
  | { status: 'error'; profiles?: Profile[]; message: string }

const STORAGE_KEY = 'fitness.profile.v1'

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))

export function isProfile(value: unknown): value is Profile {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.length > 0
    && Number.isInteger(value.weekly_goal)
    && (value.weekly_goal as number) >= WEEKLY_GOAL_MIN && (value.weekly_goal as number) <= WEEKLY_GOAL_MAX
    && (value.speed_unit === 'kmh' || value.speed_unit === 'pace')
    && (value.weight_kg === null || (typeof value.weight_kg === 'number' && Number.isFinite(value.weight_kg) && value.weight_kg >= 20 && value.weight_kg <= 300))
    && isDate(value.created_at) && isDate(value.updated_at)
}

const isProfileList = (value: unknown): value is Profile[] =>
  Array.isArray(value) && value.length > 0 && value.every(isProfile)

/* ---------- Choix de l’appareil (localStorage) ---------- */

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Stockage refusé (navigation privée, quota) : le choix vaut pour cette page seulement.
  }
}

/* ---------- Store ---------- */

let state: ProfilesState = { status: 'loading' }
let stored = readStored()
let pending: Promise<void> | undefined
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function set(next: ProfilesState) {
  state = next
  emit()
}

const known = (s: ProfilesState) => (s.status === 'loading' ? undefined : s.profiles)

async function fetchProfiles() {
  try {
    set({ status: 'ok', profiles: await api('/api/profiles', { validate: isProfileList }) })
  } catch (error) {
    const message = errorMessage(error)
    if (state.status !== 'error' || state.message !== message) console.warn('Fitness : lecture des profils impossible', error)
    set({ status: 'error', profiles: known(state), message })
  }
}

/** Tous les appelants attendent la même lecture. */
export function loadProfiles(): Promise<void> {
  pending ??= fetchProfiles().finally(() => { pending = undefined })
  return pending
}

/** Un autre onglet du même appareil a changé de profil. */
function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) {
    stored = readStored()
    emit()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage)
    if (state.status === 'loading') void loadProfiles()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function useProfiles() {
  return useSyncExternalStore(subscribe, () => state)
}

/** Profil retenu sur cet appareil ; à défaut, le premier renvoyé par le serveur. */
export function currentOf(profiles: Profile[] | undefined): Profile | undefined {
  if (!profiles?.length) return undefined
  return profiles.find((p) => p.id === stored) ?? profiles[0]
}

export function useCurrentProfile(): Profile | undefined {
  const profiles = known(useProfiles())
  useSyncExternalStore(subscribe, () => stored)
  return currentOf(profiles)
}

export function chooseProfile(id: string) {
  stored = id
  writeStored(id)
  emit()
}

const queues = new Map<string, Promise<unknown>>()

const profileUrl = (id: string) => `/api/profiles/${encodeURIComponent(id)}`

async function patch(id: string, changes: ProfileChanges): Promise<Profile> {
  let saved: Profile
  try {
    saved = await api(profileUrl(id), { method: 'PATCH', body: changes, validate: isProfile })
  } catch (error) {
    // Profil supprimé depuis un autre appareil : la liste est relue et l’appareil passe au premier profil.
    if (error instanceof ApiError && error.status === 404) void loadProfiles()
    throw error
  }
  const list = known(state)
  if (list) set({ status: 'ok', profiles: list.map((p) => (p.id === saved.id ? saved : p)) })
  return saved
}

/**
 * Enregistre puis remplace le profil par la réponse du serveur ; l’erreur est relancée à l’appelant.
 * Les enregistrements d’un même profil partent l’un après l’autre : la dernière valeur choisie est la dernière écrite.
 */
export function saveProfile(id: string, changes: ProfileChanges): Promise<Profile> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => patch(id, changes))
  queues.set(id, run)
  void run.catch(() => undefined).finally(() => { if (queues.get(id) === run) queues.delete(id) })
  return run
}

/** Crée le profil et le choisit sur cet appareil. */
export async function createProfile(name: string): Promise<Profile> {
  const created = await api('/api/profiles', { method: 'POST', body: { name }, validate: isProfile })
  set({ status: 'ok', profiles: [...(known(state) ?? []).filter((p) => p.id !== created.id), created] })
  chooseProfile(created.id)
  return created
}

/** Supprime le profil et ses données. Si c’était le profil de l’appareil, le premier restant le remplace. */
export async function deleteProfile(id: string): Promise<void> {
  const remaining = await api(profileUrl(id), { method: 'DELETE', validate: isProfileList })
  if (stored === id) {
    stored = null
    writeStored(null)
  }
  set({ status: 'ok', profiles: remaining })
}
