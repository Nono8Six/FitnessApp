import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'
import { WorkoutCard, WorkoutLabels } from './WorkoutCard'
import { WorkoutBlocks } from './WorkoutBlocks'
import { WorkoutSummary } from './WorkoutSummary'
import { errorMessage } from '../lib/api'
import { acceptWorkoutProposal, ignoreWorkoutProposal, type WorkoutProposal as Proposal } from '../lib/coach'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import type { Preview } from '../lib/workouts'

export function WorkoutDifferences({ before, after }: { before: Preview; after: Preview }) {
  const kcal = (p: Preview) => p.summary.energy.active_kcal === null ? '--' : `≈ ${Math.round(p.summary.energy.active_kcal)} kcal`
  const slope = (p: Preview) => `${dec1(Math.min(...p.blocks.map(b => b.incline)))}–${dec1(Math.max(...p.blocks.map(b => b.incline)))} %`
  const rows = [
    ['Segments', String(before.summary.count), String(after.summary.count)],
    ['Durée', clock(before.summary.sec), clock(after.summary.sec)],
    ['Distance', `${dec1(before.summary.km)} km`, `${dec1(after.summary.km)} km`],
    ['Vitesse', `${dec1(before.summary.minSpeed)}–${dec1(before.summary.maxSpeed)} km/h`, `${dec1(after.summary.minSpeed)}–${dec1(after.summary.maxSpeed)} km/h`],
    ['Pente', slope(before), slope(after)], ['Kcal actives est.', kcal(before), kcal(after)],
    ['Dénivelé équiv.', `${Math.round(before.summary.ascent_m)} m`, `${Math.round(after.summary.ascent_m)} m`],
  ]
  return <section className="mt-4" aria-label="Différences avant acceptation">
    <h3 className="mb-2 text-headline">Avant → Proposition</h3>
    <div className="overflow-x-auto rounded-[12px] bg-surface-2"><table className="w-full text-footnote">
      <thead className="text-label-2"><tr><th className="p-3 text-left">Prévision</th><th className="p-3 text-right">Avant</th><th className="p-3 text-right">Après</th></tr></thead>
      <tbody>{rows.map(([label, old, next]) => <tr key={label} className="border-t border-sep"><th className="p-3 text-left font-normal">{label}</th><td className="num p-3 text-right text-label-2">{old}</td><td className="num p-3 text-right">{next}</td></tr>)}</tbody>
    </table></div>
    <details className="mt-3 text-subhead"><summary className="min-h-11 cursor-pointer text-accent">Comparer les consignes par segment</summary>
      <div className="grid gap-4 min-[600px]:grid-cols-2"><div><h4 className="text-label-2">Avant</h4><WorkoutBlocks data={{ name: '', items: before.blocks.map(({ kind, sec, speed, incline }) => ({ kind, sec, speed, incline })) }} /></div>
        <div><h4 className="text-label-2">Proposition</h4><WorkoutBlocks data={{ name: '', items: after.blocks.map(({ kind, sec, speed, incline }) => ({ kind, sec, speed, incline })) }} /></div></div>
    </details>
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
  return <section className="mt-4 rounded-[22px] bg-surface p-4 desk:p-5" aria-label={`Proposition : ${proposal.workout.name}`}>
    <p className="mb-3 text-footnote font-semibold text-label-2">{proposal.status === 'accepted' ? 'Séance enregistrée' : proposal.status === 'ignored' ? 'Proposition ignorée' : proposal.base ? `Ajustement · version ${proposal.base.version}` : 'Séance proposée'}</p>
    <button className="w-full text-left" onClick={() => setDetails(v => !v)} aria-expanded={details}><WorkoutCard data={proposal.workout} /></button>
    <div className="mt-3"><WorkoutLabels data={proposal.workout} /><p className="text-subhead text-label-2">{proposal.explanation}</p></div>
    {proposal.base && <WorkoutDifferences before={proposal.base} after={proposal.workout} />}
    {details && <div className="mt-4"><WorkoutSummary data={proposal.workout} /><WorkoutBlocks data={proposal.workout} /></div>}
    {proposal.status === 'pending' && <div className="mt-4 flex flex-wrap gap-3">
      <Button size="md" disabled={busy} onClick={() => void act(true)}>{busy ? 'En cours…' : proposal.base ? 'Accepter la nouvelle version' : 'Enregistrer'}</Button>
      <a aria-disabled={busy} href={busy ? undefined : href.editProposal(proposal.id)} className="pressable inline-flex min-h-11 items-center rounded-[12px] bg-fill-3 px-4 text-subhead font-semibold">Modifier</a>
      <Button size="md" variant="plain" disabled={busy} onClick={() => void act(false)}>Ignorer</Button>
    </div>}
    {proposal.status === 'accepted' && proposal.accepted_id && <a href={`${href.workout(proposal.accepted_id)}?version=${proposal.accepted_version}`} className="mt-3 inline-flex min-h-11 items-center text-subhead text-accent">Ouvrir la séance enregistrée</a>}
    {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
  </section>
}
