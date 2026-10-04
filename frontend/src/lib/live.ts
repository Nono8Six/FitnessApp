import { useSyncExternalStore } from 'react'
import { buildSamples, expand, NEXT, type Block, type ProfileId, type Programme, type Sample } from '../data/demo'

export type LiveStatus = 'idle' | 'countdown' | 'running' | 'paused' | 'stopping' | 'stopped'
export type Link = 'ok' | 'stale' | 'lost' | 'unknown'

export interface LiveEvent {
  t: number
  kind: 'pause' | 'resume' | 'stop'
}

export interface LiveState {
  status: LiveStatus
  countdown: number
  programme: Programme
  blocks: Block[]
  profile: ProfileId
  t: number
  km: number
  speed: number | null
  incline: number | null
  staleFor: number
  link: Link
  samples: Sample[]
  events: LiveEvent[]
  pausedSec: number
}

function initial(): LiveState {
  return {
    status: 'idle',
    countdown: 3,
    programme: NEXT,
    blocks: expand(NEXT.items),
    profile: 'arnaud',
    t: 0,
    km: 0,
    speed: 0,
    incline: 0,
    staleFor: 0,
    link: 'ok',
    samples: [],
    events: [],
    pausedSec: 0,
  }
}

let state = initial()
const listeners = new Set<() => void>()
let timer: number | undefined

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function blockAt(blocks: Block[], t: number) {
  return blocks.find((b) => t >= b.start && t < b.end) ?? blocks.at(-1)!
}

function jitter(t: number) {
  return 0.022 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 0.23 + 2)
}

function tick() {
  const s = state
  if (s.status === 'countdown') {
    if (s.countdown > 1) set({ countdown: s.countdown - 1 })
    else set({ status: 'running', countdown: 0 })
    return
  }
  if (s.status === 'idle' || s.status === 'stopped') return

  const moving = s.status === 'running'
  const block = blockAt(s.blocks, s.t)
  const target = moving ? block.speed : 0
  const cur = s.speed ?? target
  const rate = moving ? 0.4 : 0.9
  let next = cur + Math.max(-rate, Math.min(rate, target - cur))
  if (moving && Math.abs(target - next) < 0.3) next = target - 0.06 + jitter(s.t)
  next = Math.max(0, +next.toFixed(2))

  if (s.link !== 'ok') {
    set({ staleFor: s.staleFor + 1 })
    return
  }

  if (moving) {
    const t = s.t + 1
    if (t >= s.blocks.at(-1)!.end) {
      set({ status: 'stopping', t, events: [...s.events, { t, kind: 'stop' }] })
      return
    }
    set({
      t,
      speed: next,
      incline: blockAt(s.blocks, t).incline,
      km: s.km + next / 3600,
      samples: [...s.samples, { t, target: blockAt(s.blocks, t).speed, speed: next, incline: blockAt(s.blocks, t).incline }],
    })
  } else {
    const patch: Partial<LiveState> = { speed: next }
    if (s.status === 'paused') patch.pausedSec = s.pausedSec + 1
    if (s.status === 'stopping' && next === 0) patch.status = 'stopped'
    set(patch)
  }
}

function ensureTimer() {
  if (timer === undefined) timer = window.setInterval(tick, 1000)
}

export const live = {
  start(programme: Programme, profile: ProfileId) {
    set({ ...initial(), programme, blocks: expand(programme.items), profile, status: 'countdown', countdown: 3 })
    ensureTimer()
  },
  pause() {
    if (state.status !== 'running') return
    set({ status: 'paused', events: [...state.events, { t: state.t, kind: 'pause' }] })
  },
  resume() {
    if (state.status !== 'paused') return
    set({ status: 'running', events: [...state.events, { t: state.t, kind: 'resume' }] })
  },
  stop() {
    if (state.status !== 'running' && state.status !== 'paused') return
    set({ status: 'stopping', events: [...state.events, { t: state.t, kind: 'stop' }] })
  },
  reset() {
    set(initial())
  },
  /** Review scenario: a session already running at 17:24, block 6. */
  seed(kind: string) {
    const blocks = expand(NEXT.items)
    const t = 1044
    const samples = buildSamples(blocks, t, 3)
    let km = 0
    for (let i = 1; i < samples.length; i++) km += ((samples[i].speed ?? 0) * (samples[i].t - samples[i - 1].t)) / 3600
    const link: Link = kind === 'stale' ? 'stale' : kind === 'lost' ? 'lost' : kind === 'unknown' ? 'unknown' : 'ok'
    set({
      ...initial(),
      status: kind === 'paused' ? 'paused' : 'running',
      t,
      km,
      speed: kind === 'paused' ? 0 : 7.92,
      incline: 1,
      samples,
      link,
      staleFor: link === 'ok' ? 0 : 8,
      events: kind === 'paused' ? [{ t, kind: 'pause' }] : [],
      pausedSec: kind === 'paused' ? 34 : 0,
    })
    ensureTimer()
  },
}

export function useLive() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const isActive = (s: LiveStatus) => s === 'countdown' || s === 'running' || s === 'paused' || s === 'stopping'
