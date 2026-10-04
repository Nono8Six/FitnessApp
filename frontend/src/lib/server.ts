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
  | { status: 'down'; health?: Health }

const POLL_MS = 10_000
const TIMEOUT_MS = 4_000

let state: ServerState = { status: 'loading' }
const listeners = new Set<() => void>()
let timer: number | undefined
let inflight = false

function set(next: ServerState) {
  state = next
  listeners.forEach((l) => l())
}

export async function checkServer() {
  if (inflight) return
  inflight = true
  const ctrl = new AbortController()
  const abort = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    set({ status: 'ok', health: (await res.json()) as Health })
  } catch {
    set({ status: 'down', health: state.status === 'loading' ? undefined : state.health })
  } finally {
    window.clearTimeout(abort)
    inflight = false
  }
}

function start() {
  void checkServer()
  timer = window.setInterval(checkServer, POLL_MS)
  const wake = () => document.visibilityState === 'visible' && void checkServer()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
}

export function useServer() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      if (timer === undefined) start()
      return () => listeners.delete(l)
    },
    () => state,
  )
}
