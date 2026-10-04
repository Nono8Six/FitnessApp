import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Activity, LoaderCircle, Play, Square, Terminal } from 'lucide-react'
import { Button, cx } from '../components/ui'
import { invoke, type Options, type Phase, type Snapshot } from './bridge'

const labels: Record<Phase, string> = {
  stopped: 'À l’arrêt', preparing: 'Préparation', starting: 'Démarrage', running: 'En marche',
  stopping: 'Arrêt en cours', external: 'Déjà en marche', error: 'À vérifier',
}

const time = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString('fr-FR', { hour12: false })
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function Launcher() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [options, setOptions] = useState<Options>({ simulation: false, network: true })
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [follow, setFollow] = useState(true)
  const journal = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const value = await invoke<Snapshot>('get_snapshot')
        if (!disposed) { setSnapshot(value); setConnectionError(null) }
      } catch (error) {
        if (!disposed) setConnectionError(message(error))
      }
      if (!disposed) timer = setTimeout(refresh, 1000)
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [])

  const lastLog = snapshot?.logs.at(-1)?.id
  useEffect(() => {
    if (follow && journal.current) journal.current.scrollTop = journal.current.scrollHeight
  }, [lastLog, follow])

  async function action(command: 'start_server' | 'stop_server' | 'open_app') {
    setPending(true)
    setActionError(null)
    try {
      await invoke(command, command === 'start_server' ? { options } : {})
      setSnapshot(await invoke<Snapshot>('get_snapshot'))
    } catch (error) { setActionError(message(error)) }
    finally { setPending(false) }
  }

  const phase = snapshot?.phase
  const busy = phase === 'preparing' || phase === 'starting' || phase === 'stopping'
  const ready = phase === 'running' || phase === 'external'
  const disabled = pending || !!connectionError || !snapshot
  const editable = !disabled && !snapshot.owned && !busy && phase !== 'external'
  const shownOptions = snapshot?.owned || phase === 'external' || phase === 'stopping'
    ? { simulation: snapshot?.mode === 'simulation', network: snapshot?.network ?? options.network } : options
  const error = connectionError || actionError || snapshot?.error
  const elapsed = snapshot?.started_at ? Math.max(0, Math.floor(Date.now() / 1000) - snapshot.started_at) : null

  return (
    <main className="mx-auto max-w-[720px] px-6 py-7 sm:px-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-footnote font-semibold tracking-[0.12em] text-accent uppercase">Fitness</p>
          <h1 className="text-largetitle">Votre serveur</h1>
          <p className="mt-1 text-subhead text-label-2">Un clic pour retrouver l’application.</p>
        </div>
        <Activity size={28} strokeWidth={1.7} className="mt-2 shrink-0 text-accent" aria-hidden />
      </header>

      <section aria-label="État du serveur" className="mt-7 border-y border-sep py-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2.5" role="status" aria-live="polite">
            {busy || (!snapshot && !connectionError)
              ? <LoaderCircle size={16} className="animate-spin text-orange motion-reduce:animate-none" aria-hidden />
              : <span className={cx('h-2.5 w-2.5 rounded-full', ready ? 'bg-green' : (error ? 'bg-red' : 'bg-label-3'))} aria-hidden />}
            <h2 className="text-title3">{connectionError ? 'Lanceur indisponible' : phase ? labels[phase] : 'Connexion au lanceur'}</h2>
          </div>
          {elapsed !== null && <span className="num text-footnote text-label-2">Depuis {Math.floor(elapsed / 60)} min {elapsed % 60} s</span>}
        </div>
        <p className="mt-2 text-subhead text-label-2">
          {phase === 'preparing' ? 'Les dépendances et l’interface sont vérifiées. Le premier démarrage peut prendre quelques minutes.'
            : phase === 'starting' ? 'En attente de la réponse de Fitness…'
            : phase === 'stopping' ? 'Le serveur termine ses opérations avant de s’arrêter.'
            : phase === 'external' ? snapshot?.can_stop
              ? 'Lancé ailleurs. Vous pouvez l’ouvrir ou l’arrêter depuis cette fenêtre.'
              : 'Ancien serveur ou canal d’arrêt indisponible. Arrêtez sa console avec Ctrl+C, puis relancez Fitness.'
            : ready ? `Fitness est disponible · ${snapshot?.mode === 'simulation' ? 'Simulation' : 'Données réelles'}`
            : 'Démarrez Fitness, puis ouvrez l’application sur ce PC.'}
        </p>
        {error && <p role="alert" className="mt-3 break-words text-subhead text-red">{error}</p>}
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button disabled={!editable} onClick={() => void action('start_server')}><Play size={17} aria-hidden />Démarrer</Button>
        <Button variant={snapshot?.can_stop ? 'danger' : 'gray'} disabled={disabled || !snapshot?.can_stop || phase === 'stopping'} onClick={() => void action('stop_server')}>
          <Square size={15} aria-hidden />{phase === 'preparing' ? 'Annuler' : 'Arrêter'}
        </Button>
        <Button variant="gray" className="col-span-2" disabled={disabled || !ready} onClick={() => void action('open_app')}>
          Ouvrir l’application<ArrowUpRight size={18} aria-hidden />
        </Button>
      </div>

      <fieldset disabled={!editable} className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-subhead disabled:text-label-2">
        <legend className="sr-only">Options de démarrage</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={shownOptions.network} onChange={e => setOptions({ ...options, network: e.target.checked })} className="h-4 w-4 accent-accent" />
          Accès téléphone
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={shownOptions.simulation} onChange={e => setOptions({ ...options, simulation: e.target.checked })} className="h-4 w-4 accent-accent" />
          Simulation
        </label>
      </fieldset>
      <div className="mt-1 space-y-1 text-footnote text-label-2">
        <p>PC · <span className="select-text text-label">{snapshot?.url ?? 'http://127.0.0.1:4330'}</span></p>
        {snapshot?.phone_urls.map(url => <p key={url}>Téléphone · <span className="select-text text-label">{url}</span></p>)}
        {ready && snapshot?.phone_urls.length === 0 && <p>Accès sur ce PC. Pour le téléphone : activer l’option avant le démarrage et utiliser le même Wi-Fi.</p>}
      </div>

      <section className="mt-6" aria-label="Journal du serveur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-subhead font-semibold"><Terminal size={15} aria-hidden />Journal</h2>
          <label className="flex min-h-8 items-center gap-2 text-footnote text-label-2">
            <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} className="accent-accent" />Suivre
          </label>
        </div>
        <div ref={journal} role="log" aria-live="off" tabIndex={0} className="h-[180px] overflow-y-auto rounded-[12px] bg-surface px-4 py-3 font-mono text-[12px] leading-[19px] tracking-normal select-text">
          {!snapshot?.logs.length && <p className="font-sans text-footnote text-label-2">Les messages de démarrage apparaîtront ici.</p>}
          {snapshot?.logs.map(line => <p key={line.id} className="break-words whitespace-pre-wrap"><span className="text-label-2">{time(line.time)} </span>{line.text}</p>)}
        </div>
        <p className="mt-2 text-caption text-label-2">200 dernières lignes · Fermer cette fenêtre arrête le serveur qu’elle a lancé.</p>
      </section>
    </main>
  )
}
