import { Group, Row } from './ui'
import { clock, dec1 } from '../lib/format'
import { isRepeat, KIND_LABEL, type WorkoutInput } from '../lib/workouts'

/** Même liste de consignes pour catalogue, proposition et séance enregistrée. */
export function WorkoutBlocks({ data }: { data: WorkoutInput }) {
  return <div className="mt-4 grid gap-4">{data.items.map((item, i) => <Group key={i} header={isRepeat(item) ? `Répéter ${item.repeat} fois` : undefined}>
    {(isRepeat(item) ? item.steps : [item]).map((step, j) => <Row key={j} title={KIND_LABEL[step.kind]}
      subtitle={<span className="num"><span className="text-speed">{dec1(step.speed)} km/h</span> · <span className="text-incline">{dec1(step.incline)} %</span></span>}
      trailing={<span className="num text-time">{clock(step.sec)}</span>} />)}
  </Group>)}</div>
}
