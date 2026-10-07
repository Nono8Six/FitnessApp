import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Page } from '../components/Shell'
import { Button, Group, Row, Skeleton } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { clock } from '../lib/format'
import { href } from '../lib/router'
import { readRecordings, recordingDate, recordingLabel, type RecordingList } from '../lib/recordings'

/** Répertoire des bilans uniquement ; analyses et historique restent hors brique 9. */
export function Reports({ profile, workoutId }: { profile: string; workoutId?: string }) {
  const [data, setData] = useState<RecordingList>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const load = async (after?: string) => {
    setBusy(true); setError('')
    try {
      const next = await readRecordings(profile, after, workoutId)
      if (mounted.current) setData(old => ({ ...next, items: after ? [...(old?.items ?? []), ...next.items] : next.items }))
    } catch (e) { if (mounted.current) setError(errorMessage(e)) }
    finally { if (mounted.current) setBusy(false) }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [profile, workoutId])
  return <Page title="Bilans" back={{ label: workoutId ? 'Séance' : 'Aujourd’hui', href: workoutId ? href.workout(workoutId) : href.today }}>
    <div className="desk:max-w-[760px]">
      {!data && !error ? <Skeleton label="Chargement des bilans" /> : <>
        {error && <WorkoutError message={error} retry={() => void load(data?.next ?? undefined)} />}
        {data?.items.length === 0 ? <Group footer="Les séances réalisées sont conservées ici."><Row title="Aucun bilan" chevron={false} /><Row title="Choisir une séance" href={href.library} /></Group>
          : data && <Group>{data.items.map(row => <a key={row.id} href={href.report(row.id)} className="pressable report-list-row">
            <div className="min-w-0 flex-1"><h2 className="break-words text-headline">{row.name}</h2><p className="mt-1 text-footnote text-label-2">{recordingDate(row.started_at)}</p>
              <p className="mt-1 text-footnote text-label-2">{recordingLabel(row.phase)}{row.mode === 'simulation' && ' · Simulation'}</p></div>
            <div className="num shrink-0 text-right"><p className="text-title3 text-time">{clock(row.active_s)}</p>{row.feeling !== null && <p className="text-footnote text-label-2">Ressenti {row.feeling}/10</p>}</div>
            <ChevronRight size={18} className="shrink-0 text-label-3" />
          </a>)}</Group>}
        {data?.next && <Button className="mt-4 w-full" variant="gray" disabled={busy} onClick={() => void load(data.next ?? undefined)}>{busy ? 'Chargement…' : 'Bilans précédents'}</Button>}
      </>}
    </div>
  </Page>
}
