import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage, isRecord } from './api'

export const measurementKeys = ['speed_kmh', 'incline_pct', 'distance_m', 'elapsed_s', 'heart_rate_bpm', 'energy_kcal'] as const
export type MeasurementKey = typeof measurementKeys[number]
export interface Measurement { value: number | null; age_s: number | null; quality: 'fresh' | 'stale' | 'absent' }
export interface DeviceRange { min: number; max: number; step: number }
export interface DeviceState {
  mode: 'simulation' | 'reel'
  read_only: true
  phase: 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'disconnecting'
  device_name: string | null
  devices: { name: string; address: string }[]
  capabilities: {
    speed_range?: DeviceRange; incline_range?: DeviceRange
    treadmill_data?: boolean; control_point?: boolean; heart_rate_data?: boolean
    distance_data?: boolean; incline_data?: boolean
  }
  capability_errors: string[]
  measurements: Record<MeasurementKey, Measurement>
  stale_after_s: number
  error: string | null
}
interface DeviceEvent { type: 'snapshot' | 'state'; instance_id: string; sequence: number; state: DeviceState }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
function isRange(value: unknown): value is DeviceRange {
  return isRecord(value) && finite(value.min) && finite(value.max) && value.min <= value.max && finite(value.step) && value.step > 0
}
function isEvent(value: unknown): value is DeviceEvent {
  if (!isRecord(value) || !['snapshot', 'state'].includes(String(value.type)) || typeof value.instance_id !== 'string'
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0 || !isRecord(value.state)) return false
  const s = value.state
  if (!['simulation', 'reel'].includes(String(s.mode)) || s.read_only !== true
    || !['disconnected', 'scanning', 'connecting', 'connected', 'disconnecting'].includes(String(s.phase))
    || !(s.device_name === null || typeof s.device_name === 'string')
    || !(s.error === null || typeof s.error === 'string') || !finite(s.stale_after_s) || s.stale_after_s <= 0
    || !Array.isArray(s.capability_errors) || !s.capability_errors.every(v => typeof v === 'string')
    || !Array.isArray(s.devices) || !s.devices.every(v => isRecord(v) && typeof v.name === 'string' && typeof v.address === 'string')
    || !isRecord(s.capabilities) || !isRecord(s.measurements)) return false
  const caps = s.capabilities
  if (!['speed_range', 'incline_range'].every(k => caps[k] === undefined || isRange(caps[k]))
    || !['treadmill_data', 'control_point', 'heart_rate_data', 'distance_data', 'incline_data'].every(k => caps[k] === undefined || typeof caps[k] === 'boolean')) return false
  const measurements = s.measurements
  return measurementKeys.every(key => {
    const m = measurements[key]
    return isRecord(m) && (m.value === null || finite(m.value)) && (m.age_s === null || (finite(m.age_s) && m.age_s >= 0))
      && ['fresh', 'stale', 'absent'].includes(String(m.quality))
  })
}

/** Reconnecter l'observation uniquement ; aucune connexion automatique au tapis. */
export function useDevice() {
  const [data, setData] = useState<{ state: DeviceState; receivedAt: number }>()
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading')
  const [streamError, setStreamError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [pending, setPending] = useState<'scan' | 'connect' | 'disconnect'>()
  const [now, setNow] = useState(Date.now())
  const cursor = useRef<{ instance: string; sequence: number } | undefined>(undefined)
  const mounted = useRef(false)
  const acting = useRef(false)
  const accept = useCallback((event: DeviceEvent) => {
    const previous = cursor.current
    if (previous?.instance === event.instance_id && event.sequence < previous.sequence) return
    cursor.current = { instance: event.instance_id, sequence: event.sequence }
    setData({ state: event.state, receivedAt: Date.now() })
  }, [])

  useEffect(() => {
    mounted.current = true
    let disposed = false
    let socket: WebSocket
    let retry: number | undefined
    let deadline: number | undefined
    let backoff = 1000
    const connect = () => {
      if (disposed) return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/device/events`)
      const watchdog = () => {
        window.clearTimeout(deadline)
        deadline = window.setTimeout(() => socket.close(), 12_000)
      }
      watchdog()
      socket.onmessage = event => {
        if (disposed) return
        try {
          const next: unknown = JSON.parse(String(event.data))
          if (!isEvent(next)) throw new Error('État du tapis invalide')
          accept(next); setStatus('live'); setStreamError(undefined)
          backoff = 1000; watchdog()
        } catch (err) {
          console.warn('Fitness : état du tapis invalide', err)
          setStreamError('Réponse du tapis invalide'); socket.close()
        }
      }
      socket.onclose = () => {
        window.clearTimeout(deadline)
        if (disposed) return
        setStatus('offline')
        setStreamError(message => message ?? 'Mesures en direct interrompues. Reconnexion en cours…')
        retry = window.setTimeout(connect, backoff)
        backoff = Math.min(10_000, backoff * 2)
      }
      socket.onerror = () => socket.close()
    }
    connect()
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      disposed = true; mounted.current = false
      window.clearInterval(clock); window.clearTimeout(retry); window.clearTimeout(deadline)
      socket.close()
    }
  }, [accept])

  const act = async (operation: 'scan' | 'connect' | 'disconnect', address?: string) => {
    if (acting.current) return
    acting.current = true; setPending(operation); setActionError(undefined)
    try {
      const event = await api(`/api/device/${operation}`, {
        method: 'POST', body: address === undefined ? {} : { address }, validate: isEvent, timeout: 75_000,
      })
      if (mounted.current && (!cursor.current || cursor.current.instance === event.instance_id)) accept(event)
    } catch (err) {
      console.warn(`Fitness : ${operation} tapis impossible`, err)
      if (mounted.current) setActionError(errorMessage(err))
    } finally {
      acting.current = false
      if (mounted.current) setPending(undefined)
    }
  }
  return { data, status, now, pending, error: status === 'offline' ? streamError : actionError ?? data?.state.error ?? streamError, act }
}
