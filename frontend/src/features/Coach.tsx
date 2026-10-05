import { Archive, ArchiveRestore, ArrowDown, ArrowUp, BookOpen, ChevronRight, List, Square, SquarePen } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { CoachIcon, LibraryIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Button, cx, Glyph, Group, Row, SearchField, Segmented, Sheet } from '../components/ui'
import { errorMessage } from '../lib/api'
import { readChatGPT, type ChatGPTState } from '../lib/chatgpt'
import { archiveConversation, createConversation, readConversations, readTurns, sendMessage, stopTurn, type Conversation, type PageData, type Proposal, type Turn } from '../lib/coach'
import { href } from '../lib/router'
import { CoachMemory } from './CoachMemory'
import { WorkoutProposalCard } from '../components/WorkoutProposal'
import type { WorkoutTarget } from '../lib/coach'

const empty = <T,>(): PageData<T> => ({ items: [], total: 0, next_offset: null, partial: false })
const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
/** Date courte de liste, comme Messages : heure aujourd'hui, « Hier », jour de la semaine, puis date. */
function when(value: string) {
  const d = new Date(value), now = new Date()
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days <= 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Hier'
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
// getRandomValues fonctionne aussi sur l'adresse HTTP du PC depuis le téléphone.
const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('')
function stored(key: string) { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } }
function remember(key: string, value: string) { try { sessionStorage.setItem(key, value) } catch { /* La saisie reste en mémoire si le navigateur refuse le stockage. */ } }
/** Clavier physique : Entrée envoie, Maj+Entrée va à la ligne. Au toucher, Entrée reste un retour à la ligne. */
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

const SUGGESTIONS = ['Crée une séance : objectif, durée, difficulté et marche ou course…', 'Que me conseilles-tu aujourd’hui ?', 'Qu’avais-tu conseillé la dernière fois ?']

function IconButton({ label, onClick, disabled, children, className }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
    className={cx('pressable grid size-[34px] shrink-0 place-items-center rounded-full bg-fill-3 text-accent disabled:text-label-3', className)}>{children}</button>
}

export function Coach({ profile, target, conversationId, createWorkout }: { profile: string; target?: WorkoutTarget; conversationId?: string; createWorkout?: boolean }) {
  const draftKey = `fitness.coach.draft.${profile}`
  const [draft, setDraft] = useState(() => target ? 'Ajuste cette séance : ' : createWorkout ? 'Crée une séance : ' : stored(draftKey))
  const [workoutTarget, setWorkoutTarget] = useState(target)
  const [conversations, setConversations] = useState<PageData<Conversation>>(empty)
  const [conversation, setConversation] = useState<string>('')
  const [current, setCurrent] = useState<Conversation>()
  const [archivedView, setArchivedView] = useState(false)
  const [turns, setTurns] = useState<PageData<Turn>>(empty)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [connection, setConnection] = useState<ChatGPTState>()
  const [connectionError, setConnectionError] = useState('')
  const [history, setHistory] = useState(false)
  const [memory, setMemory] = useState(false)
  const [proposal, setProposal] = useState<{ value: Proposal; turn: string; index: number }>()
  const [notice, setNotice] = useState<{ text: string; undo?: Conversation }>()
  const [below, setBelow] = useState(false)
  const mounted = useRef(true)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const request = useRef<{ text: string; id: string } | null>(null)
  const readGeneration = useRef(0)
  const follow = useRef(true)
  const end = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const active = turns.items.find(t => t.status === 'running')
  const locked = sending || !!active
  const blocked = !connection || connection.state !== 'connected' || !connection.plan_enabled || !connection.selected_model
    || !!connection.issue && !['renewal_missing', 'network', 'unavailable'].includes(connection.issue.code)
  const connectionMessage = !connection ? 'Vérification de ChatGPT…'
    : connection.issue?.message ?? (connection.state !== 'connected' ? 'Connectez ChatGPT depuis les Réglages sur le PC.'
      : !connection.plan_enabled ? 'Autorisez l’utilisation du forfait depuis le PC.'
      : !connection.selected_model ? 'Choisissez votre modèle dans les Réglages.' : '')
  const changeDraft = (value: string) => { setDraft(value); remember(draftKey, value); if (request.current?.text !== value.trim()) request.current = null }

  const reloadList = async (offset = 0, search = query, archived = archivedView) => {
    const result = await readConversations(profile, search, offset, archived)
    if (mounted.current) setConversations(old => offset ? { ...result, items: [...old.items, ...result.items] } : result)
    return result
  }
  const open = async (c: Conversation) => {
    const generation = ++readGeneration.current
    setWorkoutTarget(undefined); setHistory(false); setConversation(c.id); setCurrent(c); remember(`fitness.coach.current.${profile}`, c.id)
    window.history.replaceState(null, '', href.coachConversation(c.id))
    setTurns(empty()); setReading(true); setError(''); follow.current = true
    try { const data = await readTurns(profile, c.id); if (mounted.current && generation === readGeneration.current) { setTurns(data); setCurrent(data.conversation) } }
    catch (e) { if (mounted.current && generation === readGeneration.current) setError(errorMessage(e)) }
    finally { if (mounted.current && generation === readGeneration.current) setReading(false) }
  }
  const startNew = () => {
    setWorkoutTarget(undefined)
    readGeneration.current++; setHistory(false); setConversation(''); setCurrent(undefined); setTurns(empty()); setError(''); changeDraft('')
    remember(`fitness.coach.current.${profile}`, '')
    composer.current?.focus()
  }
  useEffect(() => {
    mounted.current = true
    let current = true
    readConversations(profile).then(data => {
      if (!current) return
      setConversations(data)
      if (target || createWorkout) return
      if (conversationId) {
        void open({ id: conversationId, title: 'Conversation de la séance', created_at: '', updated_at: '', archived_at: null })
        return
      }
      const previous = stored(`fitness.coach.current.${profile}`)
      const found = data.items.find(c => c.id === previous) ?? data.items[0]
      if (found) void open(found)
    }).catch(e => { if (current) setError(errorMessage(e)) }).finally(() => { if (current) setLoading(false) })
    const check = () => readChatGPT().then(value => { if (current) { setConnection(value); setConnectionError('') } })
      .catch(e => { if (current) setConnectionError(errorMessage(e)) })
    void check()
    const timer = window.setInterval(check, 10000)
    return () => { current = false; mounted.current = false; controller.current?.abort(); window.clearInterval(timer) }
  }, [profile])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => readConversations(profile, query, 0, archivedView).then(data => { if (current) setConversations(data) })
      .catch(e => { if (current) setError(errorMessage(e)) }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [profile, query, archivedView])
  useEffect(() => {
    const onScroll = () => { follow.current = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 220; if (follow.current) setBelow(false) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (follow.current) end.current?.scrollIntoView({ block: 'end' })
    else if (sending) setBelow(true)
  }, [turns, sending])
  useEffect(() => {
    if (!active || sending) return
    let current = true
    const timer = setInterval(() => readTurns(profile, conversation).then(data => { if (current) setTurns(data) })
      .catch(e => { if (current) setError(errorMessage(e)) }), 1500)
    return () => { current = false; clearInterval(timer) }
  }, [active?.id, sending, profile, conversation])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 6000)
    return () => clearTimeout(timer)
  }, [notice])
  // Saisie qui grandit avec le texte, jusqu'à huit lignes environ.
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 184)}px`
  }, [draft])

  const updateTurn = (turn: Turn) => {
    if (!mounted.current) return
    setTurns(old => ({ ...old, items: old.items.some(t => t.id === turn.id) ? old.items.map(t => t.id === turn.id ? turn : t) : [...old.items, turn] }))
  }
  const send = async (text = draft.trim()) => {
    if (!text || busy.current || active || blocked) return
    busy.current = true; setSending(true); setError(''); follow.current = true
    const ctrl = new AbortController(); controller.current = ctrl
    let id = conversation, final: Turn | undefined
    try {
      request.current ??= { text, id: newRequestId() }
      if (request.current.text !== text) request.current = { text, id: newRequestId() }
      if (!id) {
        const created = await createConversation(profile)
        id = created.id
        if (!mounted.current) return
        setConversation(id); setCurrent(created); remember(`fitness.coach.current.${profile}`, id)
        // URL consultable après rechargement, sans remonter le composant ni couper le flux.
        window.history.replaceState(null, '', href.coachConversation(id))
      }
      await sendMessage(profile, id, text, request.current.id, ctrl.signal, turn => { final = turn; updateTurn(turn) }, workoutTarget)
      if (mounted.current && final?.status === 'completed') { changeDraft(''); request.current = null }
      else if (final && final.status !== 'running') request.current = null
    } catch (e) {
      if (mounted.current) setError(ctrl.signal.aborted ? 'Réponse interrompue. Votre saisie est conservée.' : errorMessage(e))
    } finally {
      controller.current = null; busy.current = false
      if (mounted.current) {
        setSending(false)
        if (id) {
          try { const data = await readTurns(profile, id); if (mounted.current) setTurns(data) }
          catch (e) { if (mounted.current) setError(errorMessage(e)) }
        }
        try {
          // Le serveur ramène une conversation archivée parmi les récentes dès qu'un message y est écrit.
          const list = await reloadList()
          if (mounted.current) setCurrent(old => list.items.find(c => c.id === id) ?? (old?.id === id ? { ...old, archived_at: null } : old))
        } catch (e) { if (mounted.current) setError(errorMessage(e)) }
      }
    }
  }
  const stop = async () => {
    try {
      if (active) await stopTurn(profile, active.id)
      else controller.current?.abort()
    } catch (e) { setError(errorMessage(e)) }
  }
  const setArchived = async (c: Conversation, archived: boolean, reopen = false) => {
    if (locked) return
    setError('')
    try {
      const updated = await archiveConversation(profile, c.id, archived)
      if (!mounted.current) return
      if (archived && conversation === c.id) startNew()
      else if (reopen || conversation === c.id) void open(updated)
      setNotice(archived ? { text: 'Conversation archivée.', undo: updated } : { text: 'Conversation remise dans la liste.' })
      await reloadList()
    } catch (e) { if (mounted.current) setError(errorMessage(e)) }
  }
  const retry = (turn: Turn) => { request.current = null; changeDraft(turn.user_text); composer.current?.focus() }

  const list = <>
    <div className="grid gap-2.5">
      <SearchField value={query} onChange={setQuery} label="Rechercher dans les conversations" maxLength={100} />
      <Segmented label="Conversations affichées" value={archivedView ? 'archived' : 'active'} onChange={v => setArchivedView(v === 'archived')}
        options={[{ value: 'active', label: 'Récentes' }, { value: 'archived', label: 'Archivées' }]} />
    </div>
    {conversations.items.length === 0
      ? <p className="py-8 text-center text-subhead text-label-2">{query ? `Aucun résultat pour « ${query} ».` : archivedView ? 'Aucune conversation archivée.' : 'Aucune conversation.'}</p>
      : <Group className="mt-3">
        {conversations.items.map(c => <div key={c.id} className={cx('g-row flex items-stretch pl-4', conversation === c.id && 'bg-fill-4')}>
          <button type="button" disabled={locked} onClick={() => void open(c)} aria-current={conversation === c.id ? 'true' : undefined}
            className="row-sep flex min-h-[60px] min-w-0 flex-1 flex-col justify-center py-2.5 pr-2 text-left disabled:opacity-50">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-subhead font-semibold">{c.title}</span>
              <span className="shrink-0 text-footnote text-label-2 first-letter:uppercase">{when(c.updated_at)}</span>
            </span>
          </button>
          <span className="row-sep flex items-center pr-2">
            <button type="button" disabled={locked} onClick={() => void setArchived(c, !archivedView, archivedView)}
              aria-label={archivedView ? `Désarchiver « ${c.title} »` : `Archiver « ${c.title} »`} title={archivedView ? 'Désarchiver' : 'Archiver'}
              className="grid size-11 place-items-center rounded-full text-label-2 hover:text-accent disabled:text-label-3">
              {archivedView ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </button>
          </span>
        </div>)}
      </Group>}
    {conversations.next_offset !== null && <Button variant="plain" size="md" className="mt-1 w-full"
      onClick={() => void reloadList(conversations.next_offset!).catch(e => setError(errorMessage(e)))}>Voir la suite</Button>}
  </>

  return <Page title="Coach" subtitle={current && conversation ? current.title : undefined} actions={<>
    <IconButton label="Conversations" className="min-[1100px]:hidden" disabled={locked} onClick={() => setHistory(true)}><List size={18} strokeWidth={2.4} /></IconButton>
    <IconButton label="Mémoire du coach" onClick={() => { setProposal(undefined); setMemory(true) }}><BookOpen size={17} strokeWidth={2.4} /></IconButton>
    <IconButton label="Nouvelle conversation" disabled={locked || reading} onClick={startNew}><SquarePen size={17} strokeWidth={2.4} /></IconButton>
  </>}>
    <div className="coach-layout">
      <aside className="coach-history" aria-label="Conversations précédentes">{list}</aside>
      <section className="min-w-0" aria-label="Conversation avec le coach">
        {workoutTarget && <p role="status" className="mb-5 rounded-[12px] bg-surface px-4 py-3 text-subhead text-label-2">Ajustement de la version {workoutTarget.version}. <a className="text-accent" href={`${href.workout(workoutTarget.workout_id)}?version=${workoutTarget.version}`}>Voir la séance</a></p>}
        {current?.archived_at && conversation && <div role="status" className="mb-5 flex items-center gap-3 rounded-[12px] bg-surface py-1.5 pr-1.5 pl-4">
          <Archive size={17} className="shrink-0 text-label-2" />
          <p className="flex-1 text-subhead text-label-2">Conversation archivée</p>
          <Button size="sm" variant="gray" disabled={locked} onClick={() => void setArchived(current, false)}>Désarchiver</Button>
        </div>}
        {(loading || reading) ? <div role="status" className="animate-pulse space-y-6 py-4">
          <span className="sr-only">Chargement des échanges…</span>
          <div className="ml-auto h-12 w-2/3 rounded-[20px] bg-surface" /><div className="h-4 w-1/4 rounded bg-fill-4" /><div className="h-24 rounded-[14px] bg-fill-4" />
        </div>
          : turns.items.length === 0 ? <div className="flex flex-col items-center py-6 text-center desk:py-10">
            <Glyph size={64}><CoachIcon size={30} /></Glyph>
            <h2 className="mt-4 text-title2">De quoi avez-vous besoin ?</h2>
            <p className="mt-2 max-w-[40ch] text-subhead text-label-2">Le coach lit votre profil, vos séances et vos échanges. Les activités réalisées ne sont pas encore enregistrées.</p>
            <Group className="mt-7 w-full max-w-[520px] text-left">
              {SUGGESTIONS.map(text => <Row key={text} title={<span className="text-subhead">{text}</span>} onClick={() => { changeDraft(text); composer.current?.focus() }} />)}
            </Group>
          </div> : <>
            {turns.next_offset !== null && <div className="mb-4 text-center"><Button variant="plain" size="md" onClick={async () => {
              try { const data = await readTurns(profile, conversation, turns.next_offset!); setTurns(old => ({ ...data, items: [...data.items, ...old.items] })) }
              catch (e) { setError(errorMessage(e)) }
            }}>Échanges plus anciens</Button></div>}
            {turns.items.map(turn => <article key={turn.id} className="mb-9">
              <div className="flex flex-col items-end">
                <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-surface-2 px-4 py-2.5 whitespace-pre-wrap break-words text-body">{turn.user_text}</p>
                <time dateTime={turn.created_at} className="mt-1 mr-1 text-caption2 text-label-3">{date(turn.created_at)}</time>
              </div>
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-2 text-footnote font-semibold text-label-2">
                  <Glyph size={24}><CoachIcon size={14} /></Glyph>Coach
                  {turn.status === 'running' && <span role="status" className="flex items-center gap-1 font-normal"><span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />Réponse en cours</span>}
                </p>
                {turn.answer ? <div className="coach-prose text-body leading-relaxed"><Markdown skipHtml components={{ img: () => null, a: ({ href: to, children }) => {
                  const allowed = turn.sources.some(source => source.href === to)
                  return allowed ? <a href={to}>{children}</a> : <span>{children}</span>
                } }}>{turn.answer}</Markdown></div> : turn.status === 'running' ? <p className="text-subhead text-label-2">Le coach consulte vos données…</p> : null}
              </div>
              {turn.sources.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Séances consultées">{turn.sources.map(s => <a key={`${s.id}:${s.version}`} href={s.href}
                className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full bg-fill-3 py-1.5 pr-3 pl-2.5 text-footnote font-medium text-accent">
                <LibraryIcon size={15} />{s.name}<span className="text-label-2">v{s.version}</span></a>)}</div>}
              {turn.status !== 'running' && turn.status !== 'completed' && <div role="status" className="mt-4 rounded-[12px] bg-orange/15 px-4 py-3 text-subhead text-orange">
                <p className="font-semibold">{turn.status === 'interrupted' ? 'Réponse interrompue' : 'Réponse échouée'} · incomplète</p>
                <p className="mt-0.5">{turn.error_message ?? 'Le texte reçu a été conservé.'}</p>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  <button disabled={locked} onClick={() => retry(turn)} className="min-h-11 font-semibold disabled:opacity-50">Reprendre le message</button>
                  {turn.error === 'limit' && <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">Consulter l’usage ChatGPT</a>}
                </div>
              </div>}
              {turn.status === 'completed' && turn.error === 'tool_error' && <p className="mt-3 text-footnote text-orange" role="status">Une consultation a échoué : les données correspondantes n’ont pas pu être vérifiées.</p>}
              {turn.status === 'completed' && turn.error === 'workout_invalid' && <p className="mt-3 text-subhead text-red" role="alert">{turn.error_message ?? 'La proposition reste invalide. Aucun programme correspondant n’a été enregistré.'}</p>}
              {turn.workout_proposals.map(value => <WorkoutProposalCard key={value.id} profile={profile} value={value} changed={() => {
                void readTurns(profile, turn.conversation_id).then(data => { if (mounted.current) setTurns(data) }).catch(e => { if (mounted.current) setError(errorMessage(e)) })
              }} />)}
              {turn.proposals.map((value, index) => <div key={index} className="mt-4 rounded-[14px] bg-surface p-4">
                <p className="flex items-center gap-1.5 text-footnote font-semibold text-label-2"><BookOpen size={14} />{value.saved_memory_id ? 'Préférence enregistrée' : 'Préférence proposée'}</p>
                <p className="mt-1.5 text-body">{value.content}</p>
                <Button className="mt-3" size="sm" variant="gray" onClick={() => { setProposal(value.saved_memory_id ? undefined : { value, turn: turn.id, index }); setMemory(true) }}>{value.saved_memory_id ? 'Voir la mémoire' : 'Vérifier et mémoriser'}</Button>
              </div>)}
              {turn.status !== 'running' && <details className="group mt-2 text-caption text-label-2">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                  Usage<ChevronRight size={13} className="transition-transform duration-300 ease-ios group-open:rotate-90" />
                </summary>
                <div className="rounded-[10px] bg-surface px-3 py-2.5 leading-relaxed">
                  {turn.model && <p>Modèle : {turn.model}</p>}
                  <p>{turn.usage.requests} requête{turn.usage.requests > 1 ? 's' : ''} au modèle. {turn.usage.reports.length !== turn.usage.requests ? 'Mesure partielle : OpenAI n’a pas transmis tous les compteurs.' : ''}</p>
                  {turn.usage.reports.length > 0 && <p>Tokens signalés : {(['input_tokens', 'cached_input_tokens', 'output_tokens'] as const).map((key, i) => {
                    const values = turn.usage.reports.map(r => r[key]); const total = values.some(v => v === null) ? 'indisponible' : values.reduce<number>((sum, v) => sum + (v ?? 0), 0).toLocaleString('fr-FR')
                    return `${['entrée', 'dont cache', 'sortie'][i]} ${total}`
                  }).join(' · ')}</p>}
                  <p>Ces compteurs ne donnent pas le quota restant du forfait.</p>
                </div>
              </details>}
            </article>)}
          </>}
        <div ref={end} className="h-3 scroll-mb-64" />
        <div className="coach-composer">
          {below && <button onClick={() => { follow.current = true; setBelow(false); end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }}
            className="pressable mx-auto mb-2 flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-subhead shadow-[0_4px_16px_rgba(0,0,0,.5)]"><ArrowDown size={16} />Dernière réponse</button>}
          {notice && <div role="status" className="animate-fade mx-auto mb-2 flex w-fit max-w-full items-center gap-3 rounded-full bg-surface-2 py-1 pr-1 pl-4 text-subhead shadow-[0_4px_16px_rgba(0,0,0,.5)]">
            {notice.text}
            {notice.undo && <Button size="sm" variant="plain" onClick={() => { const undo = notice.undo!; setNotice(undefined); void setArchived(undo, false, true) }}>Annuler</Button>}
          </div>}
          {(error || connectionError) && <p role="alert" className="mb-2 rounded-[12px] bg-red/15 px-4 py-2.5 text-subhead text-red">{error || connectionError}</p>}
          {connectionMessage && <p role="status" className="mb-2 flex items-center justify-between gap-3 rounded-[12px] bg-surface px-4 py-2 text-subhead text-label-2">
            {connectionMessage}<a href={href.settings} className="flex min-h-9 shrink-0 items-center text-accent">Réglages</a></p>}
          <form onSubmit={e => { e.preventDefault(); void send() }} className="flex items-end gap-2 rounded-[22px] bg-surface py-1.5 pr-1.5 pl-4 shadow-[inset_0_0_0_0.5px_var(--color-sep)] focus-within:shadow-[inset_0_0_0_1px_var(--color-label-3)]">
            <textarea ref={composer} aria-label="Message au coach" placeholder="Écrire au coach" rows={1} maxLength={4000} readOnly={locked}
              value={draft} onChange={e => changeDraft(e.target.value)} onKeyDown={e => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                if (e.ctrlKey || e.metaKey || finePointer()) { e.preventDefault(); void send() }
              }} className="min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-body outline-none placeholder:text-label-3 focus-visible:outline-none" />
            {locked ? <button type="button" aria-label="Interrompre la réponse" onClick={() => void stop()} className="pressable grid size-9 shrink-0 place-items-center rounded-full bg-label text-bg"><Square size={14} fill="currentColor" /></button>
              : <button type="submit" aria-label="Envoyer le message" disabled={!draft.trim() || blocked || loading || reading}
                className="pressable grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:bg-fill-3 disabled:text-label-3"><ArrowUp size={20} strokeWidth={2.6} /></button>}
          </form>
          <p className="mt-1.5 px-4 text-caption2 text-label-3">{connection?.models.find(m => m.id === connection.selected_model)?.name ?? 'ChatGPT'} · Échanges conservés sur ce PC</p>
        </div>
      </section>
    </div>
    <Sheet open={history} onClose={() => setHistory(false)} title="Conversations" trailing={<button className="h-11 min-w-11 text-headline text-accent" onClick={() => setHistory(false)}>OK</button>}>
      {list}
    </Sheet>
    {memory && <CoachMemory profile={profile} close={() => setMemory(false)} proposal={proposal} saved={() => {
      setNotice({ text: 'Mémoire mise à jour.' })
      if (conversation && !sending) void readTurns(profile, conversation).then(data => { if (mounted.current) setTurns(data) }).catch(e => { if (mounted.current) setError(errorMessage(e)) })
    }} />}
  </Page>
}
