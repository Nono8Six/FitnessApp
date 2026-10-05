import { ArrowRight, Check, ChevronDown, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, cx, Disclosure } from './ui'
import { WorkoutCard, WorkoutLabels } from './WorkoutCard'
import { WorkoutBlocks } from './WorkoutBlocks'
import { WorkoutSummary } from './WorkoutSummary'
import { errorMessage } from '../lib/api'
import { acceptWorkoutProposal, ignoreWorkoutProposal, type WorkoutProposal as Proposal } from '../lib/coach'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import type { Preview } from '../lib/workouts'

const asItems = (p: Preview) => ({ name: '', items: p.blocks.map(({ kind, sec, speed, incline }) => ({ kind, sec, speed, incline })) })

/** Avant → Après en lignes groupées ; une valeur modifiée passe en blanc gras, comme un réglage iOS changé. */
export function WorkoutDifferences({ before, after }: { before: Preview; after: Preview }) {
  const kcal = (p: Preview) => p.summary.energy.active_kcal === null ? '--' : `≈ ${Math.round(p.summary.energy.active_kcal)} kcal`
  const slope = (p: Preview) => `${dec1(Math.min(...p.blocks.map(b => b.incline)))}–${dec1(Math.max(...p.blocks.map(b => b.incline)))} %`
  const rows = [
    ['Durée', clock(before.summary.sec), clock(after.summary.sec)],
    ['Segments', String(before.summary.count), String(after.summary.count)],
    ['Distance', `${dec1(before.summary.km)} km`, `${dec1(after.summary.km)} km`],
    ['Vitesse', `${dec1(before.summary.minSpeed)}–${dec1(before.summary.maxSpeed)} km/h`, `${dec1(after.summary.minSpeed)}–${dec1(after.summary.maxSpeed)} km/h`],
    ['Pente', slope(before), slope(after)],
    ['Kcal actives', kcal(before), kcal(after)],
    ['Dénivelé équiv.', `${Math.round(before.summary.ascent_m)} m`, `${Math.round(after.summary.ascent_m)} m`],
  ]
  return <section className="mt-4" aria-label="Différences avant acceptation">
    <h3 className="mb-1.5 px-4 text-footnote text-label-2 uppercase">Avant → Proposition</h3>
    <dl className="group-bg overflow-hidden rounded-[12px] bg-surface text-subhead">
      {rows.map(([label, old, next]) => {
        const changed = old !== next
        return <div key={label} className="g-row pl-4">
          <div className="row-sep flex min-h-11 items-center gap-3 py-2 pr-4">
            <dt className="min-w-0 flex-1">{label}</dt>
            <dd className="num flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 text-right">
              {changed && <><span className="text-label-2 line-through decoration-label-3">{old}</span><ArrowRight size={13} className="text-label-3" aria-label="devient" /></>}
              <span className={cx(changed ? 'font-semibold text-label' : 'text-label-2')}>{next}</span>
            </dd>
          </div>
        </div>
      })}
    </dl>
    <Disclosure title="Comparer les consignes par segment" className="mt-3">
      <div className="grid gap-4 px-4 pb-4 min-[600px]:grid-cols-2">
        <div><h4 className="mt-1 text-footnote text-label-2 uppercase">Avant</h4><WorkoutBlocks data={asItems(before)} className="mt-2" /></div>
        <div><h4 className="mt-1 text-footnote text-label-2 uppercase">Proposition</h4><WorkoutBlocks data={asItems(after)} className="mt-2" /></div>
      </div>
    </Disclosure>
  </section>
}

export function WorkoutProposalCard({ profile, value, changed }: { profile: string; value: Proposal; changed: () => void }) {
  const [proposal, setProposal] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(false)
  const locked = useRef(false), mounted = useRef(true)
  useEffect(() => { setProposal(value) }, [value])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const act = async (accept: boolean) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      if (accept) {
        const saved = await acceptWorkoutProposal(profile, proposal.id)
        if (mounted.current) setProposal(p => ({ ...p, status: 'accepted', accepted_id: saved.id, accepted_version: saved.version }))
      } else {
        const ignored = await ignoreWorkoutProposal(profile, proposal.id)
        if (mounted.current) setProposal(ignored)
      }
      if (mounted.current) changed()
    } catch (e) { if (mounted.current) setError(errorMessage(e)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const status = proposal.status === 'accepted' ? { text: 'Enregistrée', tone: 'text-green bg-green/15' }
    : proposal.status === 'ignored' ? { text: 'Ignorée', tone: 'text-label-2 bg-fill-3' }
    : { text: proposal.base ? `Ajustement · version ${proposal.base.version}` : 'Proposition', tone: 'text-incline bg-incline/15' }
  return <section className={cx('mt-4 rounded-[22px] bg-surface p-4 desk:p-5 [&_.group-bg]:bg-surface-2', proposal.status === 'ignored' && 'opacity-70')} aria-label={`Proposition : ${proposal.workout.name}`}>
    <p className={cx('mb-3 inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption font-semibold', status.tone)}>
      {proposal.status === 'accepted' ? <Check size={13} strokeWidth={3} /> : proposal.status === 'pending' && <Sparkles size={12} strokeWidth={2.6} />}
      {status.text}
    </p>
    <button type="button" className="block w-full text-left" onClick={() => setDetails(v => !v)} aria-expanded={details}>
      <WorkoutCard data={proposal.workout} />
    </button>
    <div className="mt-3"><WorkoutLabels data={proposal.workout} className="mb-1" /><p className="text-subhead text-label-2">{proposal.explanation}</p></div>
    {proposal.base && <WorkoutDifferences before={proposal.base} after={proposal.workout} />}
    <button type="button" onClick={() => setDetails(v => !v)} aria-expanded={details}
      className="pressable mt-2 flex min-h-11 items-center gap-1 text-subhead text-accent">
      {details ? 'Masquer le détail' : 'Afficher le détail'}
      <ChevronDown size={16} strokeWidth={2.6} className={cx('transition-transform duration-300 ease-ios', details && 'rotate-180')} />
    </button>
    {details && <div className="animate-fade mt-1"><WorkoutSummary data={proposal.workout} /><WorkoutBlocks data={proposal.workout} /></div>}
    {proposal.status === 'pending' && <div className="mt-4 grid gap-2.5 min-[480px]:grid-cols-[1fr_auto_auto] min-[480px]:items-center">
      <Button size="md" disabled={busy} onClick={() => void act(true)}>{busy ? 'En cours…' : proposal.base ? 'Accepter la nouvelle version' : 'Enregistrer'}</Button>
      <a aria-disabled={busy} href={busy ? undefined : href.editProposal(proposal.id)}
        className={cx('pressable inline-flex h-11 items-center justify-center rounded-[12px] bg-fill-3 px-4 text-subhead font-semibold', busy && 'text-label-3')}>Modifier</a>
      <Button size="md" variant="plain" disabled={busy} onClick={() => void act(false)}>Ignorer</Button>
    </div>}
    {proposal.status === 'accepted' && proposal.accepted_id && <a href={`${href.workout(proposal.accepted_id)}?version=${proposal.accepted_version}`}
      className="pressable mt-3 inline-flex h-11 items-center rounded-[12px] bg-fill-3 px-4 text-subhead font-semibold text-accent">Ouvrir la séance enregistrée</a>}
    {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
  </section>
}
