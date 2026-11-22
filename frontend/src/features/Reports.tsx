import { useEffect, useRef, useState } from 'react'
import { ChevronRight, History } from 'lucide-react'
import { Page } from '../components/Shell'
import { Button, Group, Row, Skeleton, Tile } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { clock } from '../lib/format'
import { href } from '../lib/router'
import { readRecordings, recordingDate, recordingLabel, type RecordingList } from '../lib/recordings'

/** Répertoire des bilans uniquement ; analyses et historique restent hors brique 9. */
export function RecordingRows({ profile, workoutId, latest = false }: { profile: string; workoutId?: string; latest?: boolean }) {
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
  return <div className="min-w-0">
    {!data && !error && <Skeleton label="Chargement des bilans" />}
    {error && <WorkoutError message={error} retry={() => void load(data?.next ?? undefined)} />}
    {data && <Group>
      {data.items.length === 0 ? <>
        <Row leading={<Tile color="var(--color-distance)"><History size={19} /></Tile>} title={workoutId ? 'Aucun bilan pour cette séance' : 'Aucun bilan'} />
        {!latest && <Row title="Choisir une séance" href={href.library} />}
      </> : (latest ? data.items.slice(0, 1) : data.items).map(row => <a key={row.id} href={href.report(row.id)} className="pressable report-list-row">
        <div className="min-w-0 flex-1">
          <p className="break-words text-headline">{row.name}</p>
          <p className="mt-1 text-footnote text-label-2">{recordingDate(row.started_at)}</p>
          <p className="mt-1 text-footnote text-label-2">{recordingLabel(row.phase)}{row.mode === 'simulation' && ' · Simulation'}</p>
        </div>
        <div className="num shrink-0 text-right">
          <p className="text-title3 text-time">{clock(row.active_s)}</p>
          {row.feeling !== null && <p className="text-footnote text-label-2">Ressenti {row.feeling}/10</p>}
        </div>
        <ChevronRight size={18} className="shrink-0 text-label-3" />
      </a>)}
    </Group>}
    {!latest && data?.next && <Button className="mt-4 w-full" variant="gray" disabled={busy} onClick={() => void load(data.next ?? undefined)}>{busy ? 'Chargement…' : 'Bilans précédents'}</Button>}
  </div>
}

export function Reports({ profile, workoutId }: { profile: string; workoutId?: string }) {
  return <Page title="Bilans" back={workoutId ? { label: 'Séance', href: href.workout(workoutId) } : undefined}>
    <div className="desk:max-w-[760px]"><RecordingRows profile={profile} workoutId={workoutId} /></div>
  </Page>
}
