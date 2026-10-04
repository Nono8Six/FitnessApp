import { useSyncExternalStore } from 'react'
import { api, errorMessage, isRecord } from './api'

export interface Health {
  app: string
  version: string
  mode: 'reel' | 'simulation'
  data_dir: string
  /** Révision Alembic de la base. */
  schema: string
  started_at: string
  interface: boolean
  network: { enabled: boolean; addresses: string[] }
}

export type ServerState =
  | { status: 'loading' }
  | { status: 'ok'; health: Health }
  | { status: 'down'; health?: Health; message: string }

const POLL_MS = 10_000

let state: ServerState = { status: 'loading' }
const listeners = new Set<() => void>()
let timer: number | undefined
let pending: Promise<void> | undefined

function isHealth(value: unknown): value is Health {
  return isRecord(value)
    && value.app === 'Fitness'
    && typeof value.version === 'string' && value.version.length > 0
    && (value.mode === 'reel' || value.mode === 'simulation')
    && typeof value.data_dir === 'string' && value.data_dir.length > 0
    && typeof value.schema === 'string' && value.schema.length > 0
    && typeof value.started_at === 'string' && Number.isFinite(Date.parse(value.started_at))
    && typeof value.interface === 'boolean'
    && isRecord(value.network)
    && typeof value.network.enabled === 'boolean'
    && Array.isArray(value.network.addresses)
    && value.network.addresses.every((address: unknown) => typeof address === 'string')
}

function set(next: ServerState) {
  state = next
  listeners.forEach((l) => l())
}

async function fetchHealth() {
  try {
    set({ status: 'ok', health: await api('/api/health', { validate: isHealth }) })
  } catch (error) {
    const message = errorMessage(error)
    if (state.status !== 'down' || state.message !== message) {
      console.warn('Fitness : vérification du serveur impossible', error)
    }
    set({ status: 'down', health: state.status === 'loading' ? undefined : state.health, message })
  }
}

/** Tous les appelants attendent la même requête, y compris le bouton Réessayer. */
export function checkServer(): Promise<void> {
  pending ??= fetchHealth().finally(() => { pending = undefined })
  return pending
}

function wake() {
  if (document.visibilityState === 'visible') void checkServer()
}

function refreshPolling() {
  window.clearInterval(timer)
  timer = undefined
  if (document.visibilityState === 'visible') {
    wake()
    timer = window.setInterval(wake, POLL_MS)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', refreshPolling)
    window.addEventListener('online', wake)
    refreshPolling()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', refreshPolling)
      window.removeEventListener('online', wake)
    }
  }
}

export function useServer() {
  return useSyncExternalStore(subscribe, () => state)
}
