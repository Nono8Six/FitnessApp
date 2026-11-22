import { ChevronRight, Flame, Mountain } from 'lucide-react'
import { ProgrammeMini } from './charts'
import { RunIcon } from './Icons'
import { cx, Glyph } from './ui'
import { calories, clock, dec1 } from '../lib/format'
import { GOALS, LEVELS, type Preview, type WorkoutInput } from '../lib/workouts'

export function WorkoutCard({ data: p, selected = false }: { data: WorkoutInput & Preview; selected?: boolean }) {
  const energy = calories(p.summary.energy)
  const Icon = p.goal === 'incline' ? Mountain : p.goal === 'calories' ? Flame : RunIcon
  return <>
    <div className="flex items-center gap-3">
      <Glyph size={40}><Icon size={21} /></Glyph>
      <div className="min-w-0 flex-1">
        {selected && <p className="mb-0.5 text-caption font-semibold text-accent">Aujourd’hui</p>}
        <h3 className="break-words text-headline">{p.name}</h3>
        <p className="num mt-0.5 text-footnote text-label-2">{p.level ? LEVELS[p.level] : `${dec1(p.summary.minSpeed)}–${dec1(p.summary.maxSpeed)} km/h`} · {p.summary.count} segments</p>
      </div>
      <ChevronRight size={20} className="shrink-0 text-label-3" />
    </div>
    <ProgrammeMini blocks={p.blocks} height={46} className="mt-3" />
    <dl className="workout-card-stats num">
      <div><dt>Durée</dt><dd className="text-time">{clock(p.summary.sec)}</dd></div>
      <div><dt>Distance</dt><dd className="text-distance">{dec1(p.summary.km)} <small>km</small></dd></div>
      <div><dt>Kcal actives</dt><dd className={energy === null ? 'text-label-3' : 'text-energy'}>{energy ?? '--'}</dd></div>
    </dl>
  </>
}

export function WorkoutLabels({ data, className }: { data: WorkoutInput; className?: string }) {
  if (!data.goal && !data.level) return null
  return <p className={cx('text-subhead text-label-2', className ?? 'mb-4')}>{data.goal && GOALS[data.goal]}{data.goal && data.level && ' · '}{data.level && LEVELS[data.level]}</p>
}
