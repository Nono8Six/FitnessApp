import { ChevronRight, RefreshCw } from 'lucide-react'
import { ProgrammeChart } from './charts'
import { Skeleton, StatGrid, type Stat } from './ui'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import type { Preview } from '../lib/workouts'

/** Prévisions du serveur, avec la couleur de rôle de chaque mesure. */
export function workoutStats(s: Preview['summary']): Stat[] {
  const kcal = s.energy.active_kcal
  return [
    { label: 'Durée prévue', value: clock(s.sec), color: 'var(--color-time)' },
    { label: 'Distance prévue', value: dec1(s.km), unit: 'km', color: 'var(--color-distance)' },
    { label: 'Kcal actives est.', value: kcal === null ? null : `≈ ${Math.round(kcal)}`, unit: 'kcal', color: 'var(--color-energy)' },
    { label: 'Dénivelé équiv.', value: String(Math.round(s.ascent_m)), unit: 'm', color: 'var(--color-incline)' },
  ]
}

/** Lien vers le poids quand les calories ne peuvent pas être estimées. */
export function WeightLink({ className }: { className?: string }) {
  return <a href={href.settings} className={`pressable flex min-h-11 items-center justify-between gap-2 rounded-[12px] bg-surface px-4 text-subhead text-accent ${className ?? ''}`}>
    Renseigner mon poids pour les calories<ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-label-3" />
  </a>
}

/** Mesures prévues, explication des calories, puis consignes par segment. */
export function WorkoutSummary({ data, editing = false, compact = false }: { data: Preview; editing?: boolean; compact?: boolean }) {
  const energy = data.summary.energy
  return <>
    <StatGrid stats={workoutStats(data.summary)} compact={compact} />
    {energy.weight_kg === null ? editing
      ? <p className="mt-2 px-4 text-footnote text-label-2">Pour les calories, renseignez votre poids dans Réglages après avoir enregistré la séance.</p>
      : <WeightLink className="mt-3" />
      : <details className="group mt-3 rounded-[12px] bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-subhead text-label [&::-webkit-details-marker]:hidden">
          Comprendre l’estimation
          <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-label-3 transition-transform duration-300 ease-ios group-open:rotate-90" />
        </summary>
        {/* Faits en lignes courtes, comme une fiche iOS ; le détail du calcul tient en une ligne. */}
        <dl className="text-subhead">
          {([
            ['Total avec repos', `≈ ${Math.round(energy.total_kcal!)} kcal`],
            ['Poids du profil', `${dec1(energy.weight_kg)} kg`],
            ['Méthode', 'ACSM'],
            ['Course calculée au-delà de', '6 km/h'],
          ] as const).map(([label, value]) => <div key={label} className="ml-4 flex min-h-11 items-center justify-between gap-3 pr-4 shadow-[inset_0_0.5px_0_var(--color-sep)]">
            <dt className="text-label-2">{label}</dt><dd className="num text-right text-label">{value}</dd>
          </div>)}
        </dl>
        {energy.outside_range && <p className="mx-4 mt-1 rounded-[10px] bg-orange/15 px-3 py-2 text-footnote text-orange">Vitesses hors plage fiable (marche 3–6, course dès 8 km/h) : estimation moins sûre.</p>}
        <p className="px-4 pt-2 pb-3 text-footnote text-label-2">Prévision, pas une mesure.{!editing && <> <a href={href.settings} className="text-accent">Modifier mon poids</a></>}</p>
      </details>}
    <div className="mt-3 rounded-[22px] bg-surface p-4 desk:p-5">
      <ProgrammeChart blocks={data.blocks} />
    </div>
  </>
}

export function WorkoutLoading({ cards = 1 }: { cards?: number }) {
  return <Skeleton label="Chargement des séances…" cards={cards} />
}

export function WorkoutError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex items-center gap-3 rounded-[14px] bg-red/15 py-2.5 pr-2 pl-4 text-red">
    <p className="flex-1 text-subhead">{message}</p>
    <button type="button" onClick={retry} className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-red/15 px-3.5 text-subhead font-semibold"><RefreshCw size={16} strokeWidth={2.4} />Réessayer</button>
  </div>
}
