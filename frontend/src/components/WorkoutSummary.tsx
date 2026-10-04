import { ProgrammeChart } from './charts'
import { Button } from './ui'
import { clock, dec1 } from '../lib/format'
import type { Preview } from '../lib/workouts'

export function WorkoutSummary({ data }: { data: Preview }) {
  const s = data.summary
  return <>
    <dl className="grid grid-cols-3 gap-2">
      {[["Durée prévue", clock(s.sec)], ["Distance prévue", `${dec1(s.km)} km`], ["Segments", String(s.count)]].map(([label, value]) => (
        <div key={label}><dt className="text-caption text-label-2">{label}</dt><dd className="num mt-1 text-[22px] leading-7 font-semibold">{value}</dd></div>
      ))}
    </dl>
    <ProgrammeChart blocks={data.blocks} className="mt-5" />
  </>
}

export function WorkoutLoading() {
  return <div role="status" className="rounded-[22px] bg-surface p-5 text-subhead text-label-2">Chargement des séances…</div>
}

export function WorkoutError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="rounded-[14px] bg-red/15 p-4">
    <p className="text-subhead text-red">{message}</p>
    <Button size="md" variant="plain" onClick={retry} className="mt-2">Réessayer</Button>
  </div>
}
