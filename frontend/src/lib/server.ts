import { useSyncExternalStore } from 'react'

export interface Health {
  app: string
  version: string
  mode: 'reel' | 'simulation'
  data_dir: string
  started_at: string
  interface: boolean
  network: { enabled: boolean; addresses: string[] }
}

export type ServerState =
  | { status: 'loading' }
  | { status: 'ok'; health: Health }
  | { status: 'down'; health?: Health; message: string }

const POLL_MS = 10_000
const TIMEOUT_MS = 4_000

let state: ServerState = { status: 'loading' }
const listeners = new Set<() => void>()
let timer: number | undefined
let pending: Promise<void> | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHealth(value: unknown): value is Health {
  return isRecord(value)
    && value.app === 'Fitness'
    && typeof value.version === 'string' && value.version.length > 0
    && (value.mode === 'reel' || value.mode === 'simulation')
    && typeof value.data_dir === 'string' && value.data_dir.length > 0
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
  const ctrl = new AbortController()
  const abort = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let message = 'Serveur du PC injoignable'
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) {
      message = 'Serveur du PC indisponible'
      throw new Error(`GET /api/health : HTTP ${res.status}`)
    }
    message = 'Réponse du serveur invalide'
    const health: unknown = await res.json()
    if (!isHealth(health)) throw new Error('GET /api/health : format inattendu')
    set({ status: 'ok', health })
  } catch (error) {
    if (state.status !== 'down' || state.message !== message) {
      console.warn('Fitness : vérification du serveur impossible', error)
    }
    set({ status: 'down', health: state.status === 'loading' ? undefined : state.health, message })
  } finally {
    window.clearTimeout(abort)
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
