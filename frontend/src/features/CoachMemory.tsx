import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Group, Sheet } from '../components/ui'
import { errorMessage } from '../lib/api'
import { deleteMemory, readMemories, saveMemory, type Memory, type Proposal } from '../lib/coach'

export function CoachMemory({ profile, close, proposal, saved }: {
  profile: string; close: () => void; proposal?: { value: Proposal; turn: string; index: number }; saved: () => void
}) {
  const [items, setItems] = useState<Memory[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [content, setContent] = useState(proposal?.value.content ?? '')
  const [confirm, setConfirm] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const load = async (offset = 0) => {
    setError('')
    try {
      const page = await readMemories(profile, offset)
      setItems(old => offset ? [...old, ...page.items] : page.items); setNext(page.next_offset); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [profile]) // La feuille est remontée à chaque profil.
  const perform = async (operation: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await operation(); saved(); await load(); setEditing(undefined); setConfirm(undefined); setContent('') }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  return <Sheet open onClose={() => { if (!busy) close() }} title="Mémoire du coach"
    trailing={<button className="h-11 min-w-11 text-accent" disabled={busy} onClick={close}>OK</button>}>
    <p className="mb-4 text-subhead text-label-2">Préférences conservées pour ce profil. Seuls vos ajouts et confirmations sont enregistrés.</p>
    {proposal && content && !editing && <p className="mb-3 text-footnote text-label-2">Votre message : « {proposal.value.quote} »</p>}
    <label className="text-footnote text-label-2" htmlFor="coach-memory">{editing ? 'Corriger la préférence' : 'Préférence à retenir'}</label>
    <textarea id="coach-memory" rows={3} maxLength={500} value={content} onChange={e => setContent(e.target.value)}
      placeholder="Par exemple : je préfère les séances courtes en semaine."
      className="mt-2 w-full resize-y rounded-[12px] bg-surface-2 p-3 text-body text-label" />
    <div className="mt-3 mb-6 flex gap-3">
      <Button size="md" disabled={busy || !content.trim()} onClick={() => void perform(() => saveMemory(profile, content.trim(), editing,
        proposal && !editing ? { source_turn_id: proposal.turn, proposal_index: proposal.index } : undefined))}>
        {busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Mémoriser'}</Button>
      {editing && <Button size="md" variant="plain" disabled={busy} onClick={() => { setEditing(undefined); setContent('') }}>Annuler</Button>}
    </div>
    {error && <p role="alert" className="mb-4 text-subhead text-red">{error} <button className="min-h-11 text-accent" onClick={() => void load()}>Actualiser</button></p>}
    {loading ? <p role="status" className="text-label-2">Chargement…</p> : !loaded ? null : items.length === 0 ? <p className="text-subhead text-label-2">Aucune préférence mémorisée.</p> : <Group>
      {items.map(item => <div key={item.id} className="border-b border-sep/40 p-4 last:border-0">
        <p className="whitespace-pre-wrap break-words text-body">{item.content}</p>
        <p className="mt-1 text-caption text-label-2">Mis à jour le {new Date(item.updated_at).toLocaleDateString('fr-FR')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="md" variant="plain" disabled={busy} onClick={() => { setEditing(item.id); setContent(item.content) }}><Pencil size={16} />Modifier</Button>
          {confirm === item.id ? <><Button size="md" variant="danger" disabled={busy} onClick={() => void perform(() => deleteMemory(profile, item.id))}>Confirmer la suppression</Button>
            <Button size="md" variant="plain" onClick={() => setConfirm(undefined)}>Annuler</Button></>
            : <Button size="md" variant="plain" disabled={busy} onClick={() => setConfirm(item.id)}><Trash2 size={16} />Supprimer</Button>}
        </div>
      </div>)}
    </Group>}
    {next !== null && <Button className="mt-3" variant="plain" disabled={busy} onClick={() => void load(next)}>Voir la suite</Button>}
  </Sheet>
}
