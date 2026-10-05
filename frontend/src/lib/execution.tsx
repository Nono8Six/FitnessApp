import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, errorMessage, isRecord } from './api'
import { isDeviceState, type DeviceState, type MeasurementKey } from './device'
import { isWorkout, randomId, type Workout } from './workouts'
import { href, navigate } from './router'
import type { Sample } from './types'

export type Phase = 'idle' | 'countdown' | 'starting' | 'running' | 'transitioning' | 'adjusting' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'completed' | 'cancelled' | 'unknown'
export const phaseLabel: Record<Phase, string> = {
  idle: 'Aucune séance', countdown: 'Prêt à démarrer', starting: 'Démarrage en cours', running: 'En cours', transitioning: 'Nouvelle consigne',
  adjusting: 'Ajustement en cours',
  pausing: 'Pause demandée', paused: 'En pause', stopping: 'Arrêt demandé', stopped: 'Séance arrêtée', completed: 'Programme terminé', cancelled: 'Démarrage annulé', unknown: 'État de la bande inconnu',
}
export const inProgress = (phase?: Phase) => !!phase && !['idle', 'stopped', 'completed', 'cancelled'].includes(phase)
export interface LiveSample extends Sample { seq: number; active_s: number; target_incline: number; phase: Phase }
export interface Session {
  id: string | null; phase: Phase; mode: 'simulation' | 'reel'; owned_by_me: boolean
  profile: { id: string; name: string } | null; workout: Workout | null
  targets: { speed: number; incline: number }[]; offsets: { speed: number; incline: number }
  adjustment_bounds: { speed: AdjustmentRange; incline: AdjustmentRange } | null
  block_index: number; active_s: number; pause_s: number; wall_s: number; started_at: string | null
  countdown: number | null; reason: string | null; error: string | null; stop_confirmed: boolean
  restart_delay_s: number; authorization_remaining_s: number; limits: { speed: number; incline: number }
  command: { action: string; value: number | null; status: 'sent' | 'accepted' | 'observed' | 'refused' | 'unknown' } | null
  distance_m: number | null; distance_quality: 'fresh' | 'stale' | 'absent' | 'partial'
}
interface AdjustmentRange { min: number; max: number; step: number }
interface Feed { type: 'snapshot' | 'state'; instance_id: string; sequence: number; session: Session; device: DeviceState; samples: LiveSample[]; markers: { t: number; label: string }[] }
export interface Preparation { workout: Workout; profile: { id: string; name: string }; ready: boolean; issue: string | null; mode: 'simulation' | 'reel'; limits: { speed: number; incline: number } }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nullableNumber = (v: unknown) => v === null || finite(v)
const nullableString = (v: unknown) => v === null || typeof v === 'string'
const isPhase = (v: unknown): v is Phase => typeof v === 'string' && Object.hasOwn(phaseLabel, v)
const isProfile = (v: unknown) => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
const isLimits = (v: unknown) => isRecord(v) && finite(v.speed) && finite(v.incline)
const isAdjustmentRange = (v: unknown) => isRecord(v) && finite(v.min) && finite(v.max) && finite(v.step) && v.step > 0 && v.min <= v.max
function isFeed(v: unknown): v is Feed {
  if (!isRecord(v) || !['snapshot', 'state'].includes(String(v.type)) || typeof v.instance_id !== 'string'
    || !Number.isSafeInteger(v.sequence) || !isDeviceState(v.device) || !isRecord(v.session) || !Array.isArray(v.samples) || !Array.isArray(v.markers)) return false
  const s = v.session
  if (s.id !== null && (!isWorkout(s.workout) || !isProfile(s.profile)
    || !Number.isSafeInteger(s.block_index) || Number(s.block_index) < 0 || Number(s.block_index) >= s.workout.blocks.length)) return false
  if (!Array.isArray(s.targets) || !s.targets.every(isLimits) || s.targets.length !== (isWorkout(s.workout) ? s.workout.blocks.length : 0)
    || !isLimits(s.offsets) || !(s.adjustment_bounds === null || (isRecord(s.adjustment_bounds) && isAdjustmentRange(s.adjustment_bounds.speed) && isAdjustmentRange(s.adjustment_bounds.incline)))) return false
  return nullableString(s.id) && isPhase(s.phase) && ['simulation', 'reel'].includes(String(s.mode)) && typeof s.owned_by_me === 'boolean'
    && (s.profile === null || isProfile(s.profile)) && (s.workout === null || isWorkout(s.workout))
    && ['block_index', 'active_s', 'pause_s', 'wall_s', 'restart_delay_s', 'authorization_remaining_s'].every(k => finite(s[k]) && Number(s[k]) >= 0)
    && nullableNumber(s.countdown) && nullableString(s.started_at) && nullableString(s.reason) && nullableString(s.error) && typeof s.stop_confirmed === 'boolean'
    && isLimits(s.limits) && nullableNumber(s.distance_m) && ['fresh', 'stale', 'absent', 'partial'].includes(String(s.distance_quality))
    && (s.command === null || (isRecord(s.command) && typeof s.command.action === 'string' && nullableNumber(s.command.value)
      && ['sent', 'accepted', 'observed', 'refused', 'unknown'].includes(String(s.command.status))))
    && v.samples.length <= 9000 && v.samples.every(p => isRecord(p) && finite(p.seq) && finite(p.t) && finite(p.active_s)
      && finite(p.target) && finite(p.target_incline) && nullableNumber(p.speed) && nullableNumber(p.incline) && isPhase(p.phase))
    && v.markers.every(p => isRecord(p) && finite(p.t) && typeof p.label === 'string')
}
export const prepareExecution = (profile: string, workout: Workout) => api('/api/execution/prepare', {
  method: 'POST', body: { profile_id: profile, workout_id: workout.id, version: workout.version },
  validate: (v): v is Preparation => isRecord(v) && isWorkout(v.workout) && isProfile(v.profile) && typeof v.ready === 'boolean'
    && nullableString(v.issue) && ['simulation', 'reel'].includes(String(v.mode)) && isLimits(v.limits),
})

interface Selected { profile: string; workout: Workout; origin: string }
interface State {
  feed?: Feed; receivedAt: number; now: number; status: 'loading' | 'live' | 'offline'; error?: string; pending?: string
  selected?: Selected; preparing: boolean; confirmingResume: boolean
  select: (profile: string, workout: Workout) => void; setPreparing: (value: boolean) => void; clearSelected: () => void
  setConfirmingResume: (value: boolean) => void
  act: (action: 'start' | 'pause' | 'stop' | 'resume' | 'recover' | 'adjust', confirmation?: boolean, offsets?: Session['offsets']) => Promise<boolean>
}
const Context = createContext<State | null>(null)

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const [client] = useState(randomId)
  const [feed, setFeed] = useState<Feed>()
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [status, setStatus] = useState<State['status']>('loading')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<string>()
  const [selected, setSelected] = useState<Selected>()
  const [preparing, setPreparing] = useState(false)
  const [confirmingResume, setConfirmingResume] = useState(false)
  const last = useRef<Feed | undefined>(undefined)
  const cursor = useRef<{ instance: string; sequence: number } | undefined>(undefined)
  const starting = useRef(false)
  const requestNumber = useRef(0)
  const mounted = useRef(false)
  const accept = useCallback((next: Feed) => {
    if (cursor.current?.instance === next.instance_id && cursor.current.sequence > next.sequence) return
    cursor.current = { instance: next.instance_id, sequence: next.sequence }
    setFeed(previous => {
      const reset = next.type === 'snapshot' || previous?.session.id !== next.session.id || previous?.instance_id !== next.instance_id
      const after = reset ? 0 : previous?.samples.at(-1)?.seq ?? 0
      const value = { ...next, samples: (reset ? next.samples : [...(previous?.samples ?? []), ...next.samples.filter(s => s.seq > after)]).slice(-9000) }
      last.current = value
      return value
    })
    setReceivedAt(Date.now())
  }, [])
  useEffect(() => {
    mounted.current = true
    let disposed = false, socket: WebSocket, retry: number | undefined, deadline: number | undefined, backoff = 1000
    const connect = () => {
      if (disposed) return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/execution/events?client_id=${client}`)
      const watch = () => { window.clearTimeout(deadline); deadline = window.setTimeout(() => socket.close(), 8000) }
      watch()
      socket.onmessage = message => {
        try {
          const next: unknown = JSON.parse(String(message.data))
          if (!isFeed(next)) throw new Error('État de séance invalide')
          if (disposed) return
          accept(next); setStatus('live'); backoff = 1000; watch()
        } catch (e) { console.warn('Fitness : observation de séance invalide', e); socket.close() }
      }
      socket.onclose = () => {
        window.clearTimeout(deadline)
        if (disposed) return
        setStatus('offline'); retry = window.setTimeout(connect, backoff); backoff = Math.min(10000, backoff * 2)
      }
      socket.onerror = () => socket.close()
    }
    connect()
    const heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN && last.current?.session.owned_by_me)
        socket.send(JSON.stringify({ type: 'heartbeat' }))
    }, 3000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const release = () => {
      const s = last.current?.session
      if (!s?.owned_by_me || !inProgress(s.phase)) return
      void fetch('/api/execution/release', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: client, session_id: s.id }) }).catch(() => {})
    }
    window.addEventListener('pagehide', release)
    return () => {
      disposed = true; mounted.current = false
      window.clearInterval(heartbeat); window.clearInterval(clock); window.clearTimeout(retry); window.clearTimeout(deadline)
      window.removeEventListener('pagehide', release); socket.close()
    }
  }, [accept, client])
  const act: State['act'] = async (action, confirmation = false, offsets) => {
    const movement = ['start', 'resume', 'adjust'].includes(action)
    if (movement && starting.current) return false
    if (movement) starting.current = true
    const number = ++requestNumber.current
    setPending(action); setError(undefined)
    const body = action === 'start' && selected ? {
      client_id: client, profile_id: selected.profile, workout_id: selected.workout.id, version: selected.workout.version,
      safety_key: confirmation, belt_clear: confirmation,
    } : { client_id: client, session_id: last.current?.session.id, ...(action === 'resume' ? { safety_key: confirmation, belt_clear: confirmation } : {}),
      ...(action === 'adjust' ? { speed_offset: offsets?.speed, incline_offset: offsets?.incline } : {}) }
    try {
      const next = await api(`/api/execution/${action}`, { method: 'POST', body, validate: isFeed, timeout: 8000 })
      if (mounted.current) {
        accept(next)
        if (action === 'start' || action === 'resume') { setPreparing(false); setConfirmingResume(false); setSelected(undefined); navigate(href.direct) }
      }
      return true
    } catch (e) {
      console.warn(`Fitness : demande ${action} impossible`, e)
      if (mounted.current && requestNumber.current === number) setError(e instanceof ApiError && e.kind === 'network'
        ? 'Réponse du PC non reçue. Vérifiez l’état dans Direct ; aucune demande ne sera répétée.' : errorMessage(e))
      return false
    } finally {
      if (movement) starting.current = false
      if (mounted.current && requestNumber.current === number) setPending(undefined)
    }
  }
  return <Context value={{ feed, receivedAt, now, status, error, pending, selected, preparing, confirmingResume,
    select: (profile, workout) => { if (inProgress(last.current?.session.phase)) navigate(href.direct)
      else { setSelected({ profile, workout, origin: location.hash || href.today }); setPreparing(true); setError(undefined) } },
    setPreparing, clearSelected: () => { setPreparing(false); setSelected(undefined) }, setConfirmingResume, act }}>{children}</Context>
}

export function useExecution() { const state = useContext(Context); if (!state) throw new Error('ExecutionProvider absent'); return state }
export function currentMeasurement(state: State, key: MeasurementKey): number | null {
  const d = state.feed?.device, m = d?.measurements[key]
  if (state.status !== 'live' || d?.phase !== 'connected' || m?.quality !== 'fresh' || m.value === null || m.age_s === null
    || m.age_s + Math.max(0, (state.now - state.receivedAt) / 1000) > d.stale_after_s) return null
  return m.value
}
