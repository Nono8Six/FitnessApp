import { ChevronRight } from 'lucide-react'
import { ProgrammeMini } from './charts'
import { RunIcon } from './Icons'
import { cx, Glyph } from './ui'
import { clock, dec1 } from '../lib/format'
import { GOALS, LEVELS, type Preview, type WorkoutInput } from '../lib/workouts'

export function WorkoutCard({ data: p, selected = false }: { data: WorkoutInput & Preview; selected?: boolean }) {
  const kcal = p.summary.energy.active_kcal
  return <>
    <div className="flex items-center gap-3">
      <Glyph size={40}><RunIcon size={22} /></Glyph>
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-headline">{p.name}</h2>
        <p className="num text-footnote text-label-2">{p.level ? LEVELS[p.level] : `${dec1(p.summary.minSpeed)}–${dec1(p.summary.maxSpeed)} km/h`} · {p.summary.count} segments</p>
      </div>
      {selected && <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-caption font-semibold text-accent">Aujourd’hui</span>}
      <ChevronRight size={20} className="shrink-0 text-label-3" />
    </div>
    <p className="num mt-3 flex flex-wrap items-baseline gap-x-4 text-[22px] leading-7 font-semibold">
      <span className="text-time">{clock(p.summary.sec)}</span>
      <span className="text-distance">{dec1(p.summary.km)}<span className="ml-0.5 text-[16px]">KM</span></span>
      <span className={kcal === null ? 'text-label-3' : 'text-energy'}>{kcal === null ? '--' : `≈ ${Math.round(kcal)}`}<span className="ml-0.5 text-[16px]">KCAL</span></span>
    </p>
    <ProgrammeMini blocks={p.blocks} height={48} className="mt-3" />
  </>
}

export function WorkoutLabels({ data, className }: { data: WorkoutInput; className?: string }) {
  if (!data.goal && !data.level) return null
  return <p className={cx('text-subhead text-label-2', className ?? 'mb-4')}>{data.goal && GOALS[data.goal]}{data.goal && data.level && ' · '}{data.level && LEVELS[data.level]}</p>
}
