import type { LiveSample } from './execution'
import type { Block, Sample } from './types'

/** Temps actif réel : une minute de recul, 30 s de prévision, jamais au-delà du bloc suivant. */
export function courseTimeline(samples: LiveSample[], blocks: Block[], index: number, active: number) {
  const block = blocks[index], next = blocks[index + 1]
  const x0 = Math.max(0, Math.floor(active) - 60)
  const end = next?.end ?? block.end
  const x1 = Math.max(active + 1, Math.min(end, active + 30))
  const measured = samples
    .filter(p => p.active_s >= x0 - 2 && p.active_s <= active && ['running', 'transitioning', 'adjusting'].includes(p.phase))
    .map(p => ({ ...p, t: p.active_s }))
  const forecast: Sample[] = [
    { t: active, target: block.speed, target_incline: block.incline, speed: null, incline: null },
    ...(next && block.end >= active && block.end <= x1 ? [{ t: block.end, target: next.speed, target_incline: next.incline, speed: null, incline: null }] : []),
    { t: Math.min(x1, end), target: next && x1 >= block.end ? next.speed : block.speed,
      target_incline: next && x1 >= block.end ? next.incline : block.incline, speed: null, incline: null },
  ]
  const gaps: [number, number][] = []
  for (let i = 1; i < measured.length; i++) {
    if (measured[i].t - measured[i - 1].t > 2) gaps.push([measured[i - 1].t, measured[i].t])
  }
  const last = measured.at(-1)
  if (last && active - last.t > 2) gaps.push([last.t, active])
  return { x0, x1, measured, forecast, gaps }
}
