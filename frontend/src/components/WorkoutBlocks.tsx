import { Repeat } from 'lucide-react'
import { Group } from './ui'
import { clock, dec1 } from '../lib/format'
import { isHard, isRepeat, KIND_LABEL, type Step, type WorkoutInput } from '../lib/workouts'

function StepRow({ step }: { step: Step }) {
  return <div className="g-row flex items-center gap-3 pl-4">
    {/* Repère de couleur du bloc : accent pour l'effort, gris pour les blocs faciles. */}
    <span aria-hidden className={`h-8 w-1 shrink-0 rounded-full ${isHard(step.kind) ? 'bg-accent' : 'bg-[#636366]'}`} />
    <div className="row-sep flex min-h-[54px] min-w-0 flex-1 items-center gap-3 py-2 pr-4">
      <div className="min-w-0 flex-1">
        <div className="text-body">{KIND_LABEL[step.kind]}</div>
        <div className="num mt-0.5 text-footnote font-medium">
          <span className="text-speed">{dec1(step.speed)} km/h</span><span className="text-label-3"> · </span><span className="text-incline">{dec1(step.incline)} %</span>
        </div>
      </div>
      <span className="num shrink-0 text-headline text-time">{clock(step.sec)}</span>
    </div>
  </div>
}

/**
 * Même liste de consignes pour catalogue, proposition et séance enregistrée :
 * blocs consécutifs dans une liste groupée, chaque répétition dans la sienne.
 */
export function WorkoutBlocks({ data, className = 'mt-4' }: { data: WorkoutInput; className?: string }) {
  const groups: { repeat?: number; steps: Step[] }[] = []
  for (const item of data.items) {
    if (isRepeat(item)) groups.push({ repeat: item.repeat, steps: item.steps })
    else if (groups.length && groups.at(-1)!.repeat === undefined) groups.at(-1)!.steps.push(item)
    else groups.push({ steps: [item] })
  }
  return <div className={`grid gap-5 ${className}`}>{groups.map((group, i) => <Group key={i} header={group.repeat !== undefined
    ? <span className="flex items-center gap-1.5"><Repeat size={13} strokeWidth={2.6} aria-hidden />Répéter {group.repeat} fois
      <span className="num normal-case">· {clock(group.repeat * group.steps.reduce((sum, s) => sum + s.sec, 0))}</span></span>
    : undefined}>
    {group.steps.map((step, j) => <StepRow key={j} step={step} />)}
  </Group>)}</div>
}
