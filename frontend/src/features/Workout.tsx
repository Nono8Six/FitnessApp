import { Copy, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Page } from '../components/Shell'
import { Button, Group, Row, Sheet } from '../components/ui'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { clock, dec1 } from '../lib/format'
import { href, navigate } from '../lib/router'
import { deleteWorkout, duplicateWorkout, GAIT_LABEL, isRepeat, KIND_LABEL, readVersions, selectWorkout, useLibrary, type Workout as WorkoutData } from '../lib/workouts'

export function Workout({ profile, id }: { profile: string; id: string }) {
  const { state, reload } = useLibrary(profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<WorkoutData[] | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const go = (to: string) => { if (mounted.current) navigate(to) }
  const source = state.status === 'ok' ? state.data.workouts.find(w => w.id === id) : undefined
  const selected = state.status === 'ok' && state.data.selected_id === id
  const shown = history?.find(w => w.version === version) ?? source
  const oldVersion = version !== null && version !== source?.version
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (e) { console.warn('Fitness : action séance impossible', e); setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  return <Page title="Séance" back={{ label: 'Séances', href: href.library }}>
    {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
      : !source || !shown ? <WorkoutError message="Cette séance n’existe plus dans ce profil." retry={reload} /> : <>
        <div className="grid gap-7 desk:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] desk:items-start">
          <section className="min-w-0">
            <h2 className="break-words text-title1">{shown.name}</h2>
            <p className="mt-2 text-footnote text-label-2">Version {shown.version} · {shown.author === 'human' ? shown.author_name : 'ChatGPT'} · {new Date(shown.created_at).toLocaleDateString('fr-FR')}</p>
            {oldVersion && <p role="status" className="mt-3 text-subhead text-orange">Ancienne version · lecture seule</p>}
            <div className="mt-5 rounded-[22px] bg-surface p-5"><WorkoutSummary data={shown} /></div>
            <div className="mt-7 grid gap-5">
              {shown.items.map((item, i) => <Group key={i} header={isRepeat(item) ? `Répéter ${item.repeat} fois` : undefined}>
                {(isRepeat(item) ? item.steps : [item]).map((step, j) => <Row key={j} title={KIND_LABEL[step.kind]}
                  subtitle={`${dec1(step.speed)} km/h · ${dec1(step.incline)} % · ${GAIT_LABEL[step.gait ?? 'auto']}`} trailing={<span className="num">{clock(step.sec)}</span>} />)}
              </Group>)}
            </div>
          </section>
          <aside className="grid gap-3 desk:sticky desk:top-16">
            <Button disabled={busy || oldVersion} onClick={() => void run(async () => {
              await selectWorkout(profile, selected ? null : id); go(href.today)
            })}>{selected ? 'Retirer d’Aujourd’hui' : 'Choisir pour Aujourd’hui'}</Button>
            <a href={href.editWorkout(id)} className="pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-fill-3 text-headline"><Pencil size={18} />Modifier</a>
            <Button variant="gray" disabled={busy} onClick={() => void run(async () => {
              const copy = await duplicateWorkout(profile, id); go(href.workout(copy.id))
            })}><Copy size={18} />{oldVersion ? 'Dupliquer la version actuelle' : 'Dupliquer'}</Button>
            <Button variant="plain" disabled={busy} onClick={() => void run(async () => {
              setHistory(await readVersions(profile, id)); setVersion(null)
            })}>Voir les versions</Button>
            {history && <label className="text-footnote text-label-2">Version affichée
              <select aria-label="Version affichée" value={version ?? source.version} onChange={e => setVersion(Number(e.target.value))}
                className="mt-2 h-11 w-full rounded-[12px] bg-surface px-3 text-subhead text-label">
                {history.map(w => <option key={w.version} value={w.version}>Version {w.version}{w.version === source.version ? ' · actuelle' : ''}</option>)}
              </select>
            </label>}
            <Button variant="danger" disabled={busy} className="mt-4" onClick={() => setConfirmDelete(true)}><Trash2 size={18} />Supprimer</Button>
            {error && <p role="alert" className="text-subhead text-red">{error}</p>}
          </aside>
        </div>
        <Sheet open={confirmDelete} onClose={() => { if (!busy) setConfirmDelete(false) }} title="Supprimer la séance"
          leading={<button className="h-11 text-body text-accent disabled:text-label-3" disabled={busy} onClick={() => setConfirmDelete(false)}>Annuler</button>}>
          <p className="my-4 text-body">« {source.name} » et toutes ses versions seront supprimées.{selected ? ' Elle sera aussi retirée d’Aujourd’hui.' : ''}</p>
          <Button variant="danger" className="w-full" disabled={busy} onClick={() => void run(async () => {
            await deleteWorkout(profile, id); go(href.library)
          })}>{busy ? 'Suppression…' : 'Supprimer la séance'}</Button>
          {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
        </Sheet>
      </>}
  </Page>
}
