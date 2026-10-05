import { Copy, History, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Page } from '../components/Shell'
import { Button, Group, Row, Sheet, Tile } from '../components/ui'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { WorkoutLabels } from '../components/WorkoutCard'
import { WorkoutBlocks } from '../components/WorkoutBlocks'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { deleteWorkout, duplicateWorkout, readVersions, selectWorkout, useLibrary, type Workout as WorkoutData } from '../lib/workouts'

export function Workout({ profile, id, requestedVersion }: { profile: string; id: string; requestedVersion?: number }) {
  const { state, reload } = useLibrary(profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<WorkoutData[] | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [versionReload, setVersionReload] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!requestedVersion) return
    let active = true
    setBusy(true); setError('')
    readVersions(profile, id).then(rows => {
      if (!active) return
      setHistory(rows)
      if (rows.some(row => row.version === requestedVersion)) setVersion(requestedVersion)
      else setError('Cette version n’existe plus.')
    }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [profile, id, requestedVersion, versionReload])
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
  const date = shown && new Date(shown.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  return <Page title={shown?.name ?? 'Séance'} back={{ label: 'Séances', href: href.library }}
    subtitle={shown && `Version ${shown.version} · ${shown.author === 'human' ? shown.author_name : 'ChatGPT'} · ${date}`}>
    {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
      : requestedVersion && (!history || !history.some(w => w.version === requestedVersion))
        ? error ? <WorkoutError message={error} retry={() => setVersionReload(v => v + 1)} /> : <WorkoutLoading />
      : !source || !shown ? <WorkoutError message="Cette séance n’existe plus dans ce profil." retry={reload} /> : <>
        <div className="grid gap-7 desk:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] desk:items-start">
          <section className="min-w-0" aria-label="Détails de la séance">
            {oldVersion && <p role="status" className="mb-4 rounded-[12px] bg-orange/15 px-4 py-2.5 text-subhead text-orange">Ancienne version · lecture seule</p>}
            <WorkoutLabels data={shown} />
            <WorkoutSummary data={shown} />
            <h2 className="mt-8 mb-2.5 px-1 text-title2">Segments</h2>
            <WorkoutBlocks data={shown} />
          </section>
          <aside className="grid gap-5 desk:sticky desk:top-16" aria-label="Actions">
            <Button disabled={busy || oldVersion} onClick={() => void run(async () => {
              await selectWorkout(profile, selected ? null : id); go(href.today)
            })} variant={selected ? 'gray' : 'primary'}>{selected ? 'Retirer d’Aujourd’hui' : 'Choisir pour Aujourd’hui'}</Button>
            <Group>
              <Row href={href.editWorkout(id)} leading={<Tile><Pencil size={17} strokeWidth={2.2} /></Tile>} title="Modifier" />
              <Row href={href.coachAdjust(id, shown.version)} title="Ajuster avec ChatGPT" />
              <Row onClick={busy ? undefined : () => void run(async () => {
                const copy = await duplicateWorkout(profile, id); go(href.workout(copy.id))
              })} leading={<Tile color="#8e8e93"><Copy size={17} strokeWidth={2.2} /></Tile>}
                title={oldVersion ? 'Dupliquer la version actuelle' : 'Dupliquer'} chevron={false} />
              {history ? <div className="g-row flex items-center gap-3 pl-4">
                <Tile color="#8e8e93"><History size={17} strokeWidth={2.2} /></Tile>
                <label className="row-sep flex min-h-11 flex-1 items-center justify-between gap-3 py-1 pr-2 text-body">Version
                  <select aria-label="Version affichée" value={version ?? source.version} onChange={e => setVersion(Number(e.target.value))}
                    className="h-11 min-w-0 bg-transparent text-right text-body text-label-2 outline-none">
                    {history.map(w => <option key={w.version} value={w.version}>{w.version}{w.version === source.version ? ' · actuelle' : ''}</option>)}
                  </select>
                </label>
              </div> : <Row onClick={busy ? undefined : () => void run(async () => {
                setHistory(await readVersions(profile, id)); setVersion(null)
              })} leading={<Tile color="#8e8e93"><History size={17} strokeWidth={2.2} /></Tile>} title="Voir les versions" />}
            </Group>
            <Group>
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}
                className="g-row flex min-h-11 w-full items-center justify-center px-4 text-body text-red active:bg-fill-4 desk:hover:bg-fill-4 disabled:text-label-3">
                Supprimer la séance
              </button>
            </Group>
            <p className="px-1 text-footnote text-label-2">{shown.origin?.kind === 'catalog' ? 'Origine : modèle du catalogue' : shown.origin?.kind === 'chatgpt' ? 'Origine : proposition ChatGPT' : 'Origine : création manuelle'}
              {shown.origin?.conversation_id && <> · <a href={href.coachConversation(shown.origin.conversation_id)} className="text-accent">Conversation</a></>}</p>
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
