import { ArrowDown, ArrowUp, BookOpen, List, Plus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Page } from '../components/Shell'
import { Button, cx, Sheet } from '../components/ui'
import { errorMessage } from '../lib/api'
import { readChatGPT, type ChatGPTState } from '../lib/chatgpt'
import { createConversation, readConversations, readTurns, sendMessage, stopTurn, type Conversation, type PageData, type Proposal, type Turn } from '../lib/coach'
import { href } from '../lib/router'
import { CoachMemory } from './CoachMemory'

const empty = <T,>(): PageData<T> => ({ items: [], total: 0, next_offset: null, partial: false })
const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
// getRandomValues fonctionne aussi sur l'adresse HTTP du PC depuis le téléphone.
const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('')
function stored(key: string) { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } }
function remember(key: string, value: string) { try { sessionStorage.setItem(key, value) } catch { /* La saisie reste en mémoire si le navigateur refuse le stockage. */ } }

export function Coach({ profile }: { profile: string }) {
  const draftKey = `fitness.coach.draft.${profile}`
  const [draft, setDraft] = useState(() => stored(draftKey))
  const [conversations, setConversations] = useState<PageData<Conversation>>(empty)
  const [conversation, setConversation] = useState<string>('')
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
  const [notice, setNotice] = useState('')
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
  const blocked = !connection || connection.state !== 'connected' || !connection.plan_enabled || !connection.selected_model
    || !!connection.issue && !['renewal_missing', 'network', 'unavailable'].includes(connection.issue.code)
  const connectionMessage = !connection ? 'Vérification de ChatGPT…'
    : connection.issue?.message ?? (connection.state !== 'connected' ? 'Connectez ChatGPT depuis les Réglages sur le PC.'
      : !connection.plan_enabled ? 'Autorisez l’utilisation du forfait depuis le PC.'
      : !connection.selected_model ? 'Choisissez votre modèle dans les Réglages.' : '')
  const changeDraft = (value: string) => { setDraft(value); remember(draftKey, value); if (request.current?.text !== value.trim()) request.current = null }

  const reloadList = async (offset = 0, search = query) => {
    const result = await readConversations(profile, search, offset)
    if (mounted.current) setConversations(old => offset ? { ...result, items: [...old.items, ...result.items] } : result)
    return result
  }
  const open = async (id: string) => {
    const generation = ++readGeneration.current
    setHistory(false); setConversation(id); remember(`fitness.coach.current.${profile}`, id)
    setTurns(empty()); setReading(true); setError(''); follow.current = true
    try { const data = await readTurns(profile, id); if (mounted.current && generation === readGeneration.current) setTurns(data) }
    catch (e) { if (mounted.current && generation === readGeneration.current) setError(errorMessage(e)) }
    finally { if (mounted.current && generation === readGeneration.current) setReading(false) }
  }
  useEffect(() => {
    mounted.current = true
    let current = true
    readConversations(profile).then(data => {
      if (!current) return
      setConversations(data)
      const previous = stored(`fitness.coach.current.${profile}`)
      const id = data.items.find(c => c.id === previous)?.id ?? data.items[0]?.id
      if (id) void open(id)
    }).catch(e => { if (current) setError(errorMessage(e)) }).finally(() => { if (current) setLoading(false) })
    const check = () => readChatGPT().then(value => { if (current) { setConnection(value); setConnectionError('') } })
      .catch(e => { if (current) setConnectionError(errorMessage(e)) })
    void check()
    const timer = window.setInterval(check, 10000)
    return () => { current = false; mounted.current = false; controller.current?.abort(); window.clearInterval(timer) }
  }, [profile])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => readConversations(profile, query).then(data => { if (current) setConversations(data) })
      .catch(e => { if (current) setError(errorMessage(e)) }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [profile, query])
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
        setConversation(id); remember(`fitness.coach.current.${profile}`, id)
      }
      await sendMessage(profile, id, text, request.current.id, ctrl.signal, turn => { final = turn; updateTurn(turn) })
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
        try { await reloadList() } catch (e) { if (mounted.current) setError(errorMessage(e)) }
      }
    }
  }
  const stop = async () => {
    try {
      if (active) await stopTurn(profile, active.id)
      else controller.current?.abort()
    } catch (e) { setError(errorMessage(e)) }
  }
  const retry = (turn: Turn) => { request.current = null; changeDraft(turn.user_text); composer.current?.focus() }
  const list = <>
    <label htmlFor="coach-search" className="sr-only">Rechercher les conversations</label>
    <input id="coach-search" type="search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un échange"
      className="mb-3 h-11 w-full rounded-[12px] bg-fill-3 px-3 text-subhead" />
    {conversations.items.length === 0 && <p className="py-4 text-subhead text-label-2">{query ? 'Aucun échange trouvé.' : 'Aucune conversation.'}</p>}
    {conversations.items.map(c => <button key={c.id} disabled={sending || !!active} onClick={() => void open(c.id)} aria-current={conversation === c.id ? 'true' : undefined}
      className={cx('mb-1 w-full rounded-[12px] px-3 py-3 text-left disabled:opacity-50', conversation === c.id ? 'bg-surface' : 'hover:bg-fill-3')}>
      <span className="line-clamp-2 break-words text-subhead font-medium">{c.title}</span>
      <span className="mt-1 block text-caption text-label-2">{date(c.updated_at)}</span>
    </button>)}
    {conversations.next_offset !== null && <Button variant="plain" size="md" onClick={() => void reloadList(conversations.next_offset!).catch(e => setError(errorMessage(e)))}>Voir la suite</Button>}
  </>
  return <Page title="Coach" actions={<button aria-label="Mémoire du coach" onClick={() => { setProposal(undefined); setMemory(true) }} className="flex h-11 items-center gap-2 text-accent"><BookOpen size={19} /><span className="text-subhead">Mémoire</span></button>}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <Button size="md" variant="gray" className="min-[1100px]:hidden" disabled={sending || !!active} onClick={() => setHistory(true)}><List size={18} />Conversations</Button>
      <Button size="md" variant="plain" disabled={sending || !!active || reading} onClick={() => {
        readGeneration.current++; setConversation(''); setTurns(empty()); setError(''); changeDraft(''); remember(`fitness.coach.current.${profile}`, '')
      }}><Plus size={19} />Nouvelle</Button>
    </div>
    <div className="coach-layout">
      <aside className="coach-history" aria-label="Conversations précédentes">{list}</aside>
      <section className="min-w-0" aria-label="Conversation avec le coach">
        {(loading || reading) ? <div role="status" className="animate-pulse space-y-5 py-8"><p className="text-label-2">Chargement des échanges…</p><div className="h-16 rounded-[14px] bg-surface" /><div className="h-24 rounded-[14px] bg-surface" /></div>
          : turns.items.length === 0 ? <div className="py-8 desk:py-12">
            <h2 className="text-title3">De quoi avez-vous besoin aujourd’hui ?</h2>
            <p className="mt-3 max-w-[46ch] text-body text-label-2">Le coach consulte votre profil, vos séances et vos échanges. Les activités réalisées ne sont pas encore enregistrées.</p>
            <div className="mt-7 grid gap-2">
              {['Que me conseilles-tu aujourd’hui ?', 'J’ai vingt minutes et je suis fatigué : quelle séance choisir ?', 'Qu’avais-tu conseillé la dernière fois ?'].map(text =>
                <button key={text} onClick={() => { changeDraft(text); composer.current?.focus() }} className="min-h-11 rounded-[12px] bg-surface px-4 py-3 text-left text-subhead hover:bg-surface-2">{text}</button>)}
            </div>
          </div> : <>
            {turns.next_offset !== null && <Button variant="plain" size="md" onClick={async () => {
              try { const data = await readTurns(profile, conversation, turns.next_offset!); setTurns(old => ({ ...data, items: [...data.items, ...old.items] })) }
              catch (e) { setError(errorMessage(e)) }
            }}>Échanges plus anciens</Button>}
            {turns.items.map(turn => <article key={turn.id} className="mb-8">
              <div className="ml-auto max-w-[92%] rounded-[18px] bg-surface px-4 py-3"><p className="whitespace-pre-wrap break-words text-body">{turn.user_text}</p></div>
              <p className="mt-2 text-right text-caption text-label-2">{date(turn.created_at)}</p>
              <div className="mt-5 text-body leading-relaxed">
                <p className="mb-2 text-footnote font-semibold text-label-2">Coach{turn.status === 'running' ? ' · Réponse en cours' : ''}</p>
                {turn.answer ? <div className="coach-prose"><Markdown skipHtml components={{ img: () => null, a: ({ href: to, children }) => {
                  const allowed = turn.sources.some(source => source.href === to)
                  return allowed ? <a href={to}>{children}</a> : <span>{children}</span>
                } }}>{turn.answer}</Markdown></div> : turn.status === 'running' ? <p role="status" className="text-subhead text-label-2">Le coach consulte vos données…</p> : null}
              </div>
              {turn.sources.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Séances consultées">{turn.sources.map(s => <a key={`${s.id}:${s.version}`} href={s.href}
                className="inline-flex min-h-11 items-center rounded-[12px] bg-fill-3 px-3 py-2 text-footnote text-accent">{s.name} · v{s.version}</a>)}</div>}
              {turn.status !== 'running' && turn.status !== 'completed' && <div role="status" className="mt-4 rounded-[12px] bg-orange/15 p-3 text-subhead text-orange">
                <p>{turn.status === 'interrupted' ? 'Réponse interrompue' : 'Réponse échouée'} · incomplète</p>
                <p className="mt-1">{turn.error_message ?? 'Le texte reçu a été conservé.'}</p>
                {turn.error === 'limit' && <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">Consulter l’usage ChatGPT</a>}
                <button disabled={sending || !!active} onClick={() => retry(turn)} className="min-h-11 font-semibold disabled:opacity-50">Reprendre le message</button>
              </div>}
              {turn.status === 'completed' && turn.error === 'tool_error' && <p className="mt-3 text-footnote text-orange" role="status">Une consultation a échoué : les données correspondantes n’ont pas pu être vérifiées.</p>}
              {turn.proposals.map((value, index) => <div key={index} className="mt-4 rounded-[12px] bg-surface p-4">
                <p className="text-footnote text-label-2">{value.saved_memory_id ? 'Préférence enregistrée' : 'Préférence proposée · à confirmer'}</p><p className="mt-2 text-body">{value.content}</p>
                <Button className="mt-3" size="md" variant="gray" onClick={() => { setProposal(value.saved_memory_id ? undefined : { value, turn: turn.id, index }); setMemory(true) }}>{value.saved_memory_id ? 'Voir la mémoire' : 'Vérifier et mémoriser'}</Button>
              </div>)}
              {turn.status !== 'running' && <details className="mt-3 text-caption text-label-2"><summary className="min-h-11 cursor-pointer py-3">Usage de cette réponse</summary>
                {turn.model && <p className="mb-1">Modèle : {turn.model}</p>}
                <p>{turn.usage.requests} requête{turn.usage.requests > 1 ? 's' : ''} au modèle. {turn.usage.reports.length !== turn.usage.requests ? 'Mesure partielle : OpenAI n’a pas transmis tous les compteurs.' : ''}</p>
                {turn.usage.reports.length > 0 && <p className="mt-1">Tokens signalés : {(['input_tokens', 'cached_input_tokens', 'output_tokens'] as const).map((key, i) => {
                  const values = turn.usage.reports.map(r => r[key]); const total = values.some(v => v === null) ? 'indisponible' : values.reduce<number>((sum, v) => sum + (v ?? 0), 0).toLocaleString('fr-FR')
                  return `${['entrée', 'dont cache', 'sortie'][i]} ${total}`
                }).join(' · ')}</p>}
                <p className="mt-1">Ces compteurs ne donnent pas le quota restant du forfait.</p>
              </details>}
            </article>)}
          </>}
        <div ref={end} className="h-3 scroll-mb-64" />
        <div className="coach-composer">
          {below && <button onClick={() => { follow.current = true; setBelow(false); end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }}
            className="mx-auto mb-2 flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-subhead"><ArrowDown size={16} />Dernière réponse</button>}
          {notice && <p role="status" className="mb-2 text-footnote text-green">{notice}</p>}
          {(error || connectionError) && <p role="alert" className="mb-2 text-subhead text-red">{error || connectionError}</p>}
          {connectionMessage && <p role="status" className="mb-2 text-subhead text-label-2">{connectionMessage} <a href={href.settings} className="text-accent">Réglages</a></p>}
          <form onSubmit={e => { e.preventDefault(); void send() }} className="flex items-end gap-2 rounded-[18px] bg-surface p-2">
            <textarea ref={composer} aria-label="Message au coach" placeholder="Écrire au coach…" rows={2} maxLength={4000} readOnly={sending || !!active}
              value={draft} onChange={e => changeDraft(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
              }} className="max-h-44 min-h-14 flex-1 resize-y bg-transparent px-2 py-2 text-body outline-none" />
            {sending || active ? <button type="button" aria-label="Interrompre la réponse" onClick={() => void stop()} className="grid size-11 shrink-0 place-items-center rounded-full bg-label text-bg"><Square size={18} fill="currentColor" /></button>
              : <button type="submit" aria-label="Envoyer le message" disabled={!draft.trim() || blocked || loading || reading}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:bg-fill-3 disabled:text-label-3"><ArrowUp size={22} /></button>}
          </form>
          <p className="mt-2 text-caption text-label-2">{connection?.models.find(m => m.id === connection.selected_model)?.name ?? 'ChatGPT'} · Échanges conservés sur ce PC</p>
        </div>
      </section>
    </div>
    <Sheet open={history} onClose={() => setHistory(false)} title="Conversations" trailing={<button className="h-11 min-w-11 text-accent" onClick={() => setHistory(false)}>OK</button>}>
      {list}
    </Sheet>
    {memory && <CoachMemory profile={profile} close={() => setMemory(false)} proposal={proposal} saved={() => {
      setNotice('Mémoire mise à jour pour ce profil.')
      if (conversation && !sending) void readTurns(profile, conversation).then(data => { if (mounted.current) setTurns(data) }).catch(e => { if (mounted.current) setError(errorMessage(e)) })
    }} />}
  </Page>
}
