import { ChevronsUpDown, Copy, History, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Button, Glyph, Group, Menu, Row, Sheet, Tile } from '../components/ui'
import { WorkoutError, WorkoutLoading, WorkoutSummary } from '../components/WorkoutSummary'
import { WorkoutBlocks } from '../components/WorkoutBlocks'
import { errorMessage } from '../lib/api'
import { href, navigate } from '../lib/router'
import { deleteWorkout, duplicateWorkout, GOALS, LEVELS, readVersions, selectWorkout, useLibrary, type Workout as WorkoutData } from '../lib/workouts'

const shortDate = (value: string) => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

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
  const loadVersions = () => void run(async () => { setHistory(await readVersions(profile, id)); setVersion(null) })
  const ready = state.status === 'ok' && !!source && !!shown
    && !(requestedVersion && (!history || !history.some(w => w.version === requestedVersion)))
  return <Page title={shown?.name ?? 'Séance'} back={{ label: 'Séances', href: href.myWorkouts }}
    subtitle={shown && `${shown.author === 'human' ? shown.author_name : 'ChatGPT'} · ${shortDate(shown.created_at)}`}
    trailing={ready && <a href={href.editWorkout(id)} className="pressable flex h-11 items-center text-body text-accent">Modifier</a>}>
    {state.status === 'loading' ? <WorkoutLoading /> : state.status === 'error' ? <WorkoutError message={state.message} retry={reload} />
      : requestedVersion && (!history || !history.some(w => w.version === requestedVersion))
        ? error ? <WorkoutError message={error} retry={() => setVersionReload(v => v + 1)} /> : <WorkoutLoading />
      : !source || !shown ? <WorkoutError message="Cette séance n’existe plus dans ce profil." retry={reload} /> : <>
        {/* Téléphone : action principale, détails, puis actions secondaires. PC : détails à gauche, actions à droite. */}
        <div className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] desk:grid-rows-[auto_1fr] desk:items-start desk:gap-x-8">
          <div className="grid gap-4 desk:col-start-2 desk:row-start-1">
            <div className="flex items-center gap-3">
              <Glyph size={48}><RunIcon size={26} /></Glyph>
              <div className="min-w-0 text-subhead">
                <p className="font-semibold">{shown.goal ? GOALS[shown.goal] : 'Séance sur tapis'}</p>
                <p className="text-label-2">{[shown.level && LEVELS[shown.level], `Version ${shown.version}`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            {oldVersion && <p role="status" className="rounded-[12px] bg-orange/15 px-4 py-2.5 text-subhead text-orange">Ancienne version · lecture seule</p>}
            <Button disabled={busy || oldVersion} onClick={() => void run(async () => {
              await selectWorkout(profile, selected ? null : id); go(href.today)
            })} variant={selected ? 'gray' : 'primary'}>{selected ? 'Retirer d’Aujourd’hui' : 'Choisir pour Aujourd’hui'}</Button>
          </div>
          <section className="min-w-0 desk:col-start-1 desk:row-span-2 desk:row-start-1" aria-label="Détails de la séance">
            <WorkoutSummary data={shown} />
            <h2 className="mt-8 mb-2.5 px-1 text-title2">Segments</h2>
            <WorkoutBlocks data={shown} className="" />
          </section>
          <aside className="grid gap-5 desk:col-start-2 desk:row-start-2" aria-label="Actions">
            <Group>
              <Row href={href.coachAdjust(id, shown.version)} leading={<Tile color="var(--color-incline)"><Sparkles size={17} strokeWidth={2.2} /></Tile>} title="Ajuster avec ChatGPT" />
              <Row onClick={busy ? undefined : () => void run(async () => {
                const copy = await duplicateWorkout(profile, id); go(href.workout(copy.id))
              })} leading={<Tile color="#8e8e93"><Copy size={17} strokeWidth={2.2} /></Tile>}
                title={oldVersion ? 'Dupliquer la version actuelle' : 'Dupliquer'} chevron={false} />
              {history ? <div className="g-row flex items-center gap-3 pl-4">
                <Tile color="#8e8e93"><History size={17} strokeWidth={2.2} /></Tile>
                <div className="row-sep flex min-h-11 flex-1 items-center justify-between gap-3 py-1 pr-2 text-body">
                  Version
                  <Menu label={`Version affichée : ${version ?? source.version}`}
                    className="pressable flex h-11 items-center gap-1 rounded-[8px] px-2 text-body text-label-2"
                    button={<><span className="num">{version ?? source.version}{(version ?? source.version) === source.version ? ' · actuelle' : ''}</span><ChevronsUpDown size={15} /></>}
                    items={[...history].reverse().map(w => ({
                      label: `Version ${w.version}${w.version === source.version ? ' · actuelle' : ''} · ${shortDate(w.created_at)}`,
                      checked: w.version === (version ?? source.version), onSelect: () => setVersion(w.version),
                    }))} />
                </div>
              </div> : <Row onClick={busy ? undefined : loadVersions} leading={<Tile color="#8e8e93"><History size={17} strokeWidth={2.2} /></Tile>} title="Voir les versions" />}
            </Group>
            <Group>
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}
                className="g-row flex min-h-11 w-full items-center justify-center px-4 text-body text-red active:bg-fill-4 desk:hover:bg-fill-4 disabled:text-label-3">
                Supprimer la séance
              </button>
            </Group>
            <p className="-mt-2 px-4 text-footnote text-label-2">{shown.origin?.kind === 'catalog' ? 'Origine : modèle du catalogue' : shown.origin?.kind === 'chatgpt' ? 'Origine : proposition ChatGPT' : 'Origine : création manuelle'}
              {shown.origin?.conversation_id && <> · <a href={href.coachConversation(shown.origin.conversation_id)} className="text-accent">Voir la conversation</a></>}</p>
            {error && <p role="alert" className="px-1 text-subhead text-red">{error}</p>}
          </aside>
        </div>
        <Sheet open={confirmDelete} onClose={() => { if (!busy) setConfirmDelete(false) }} title="Supprimer la séance">
          <p className="mt-1 mb-6 px-1 text-subhead text-label-2">« {source.name} » et toutes ses versions seront supprimées.{selected ? ' Elle sera aussi retirée d’Aujourd’hui.' : ''}</p>
          <Button variant="danger" className="w-full" disabled={busy} onClick={() => void run(async () => {
            await deleteWorkout(profile, id); go(href.myWorkouts)
          })}>{busy ? 'Suppression…' : 'Supprimer la séance'}</Button>
          <Button variant="gray" className="mt-2.5 w-full" disabled={busy} onClick={() => setConfirmDelete(false)}>Annuler</Button>
          {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
        </Sheet>
      </>}
  </Page>
}
