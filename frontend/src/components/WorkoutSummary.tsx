import { ProgrammeChart } from './charts'
import { Button } from './ui'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'
import type { Preview } from '../lib/workouts'

export function WorkoutSummary({ data, editing = false }: { data: Preview; editing?: boolean }) {
  const s = data.summary
  const energy = s.energy
  return <>
    <dl className="grid grid-cols-3 gap-2">
      {[["Durée prévue", clock(s.sec)], ["Distance prévue", `${dec1(s.km)} km`], ["Kcal actives est.", energy.active_kcal === null ? '—' : `≈ ${Math.round(energy.active_kcal)}`]].map(([label, value]) => (
        <div key={label}><dt className="text-caption text-label-2">{label}</dt><dd className="num mt-1 text-[22px] leading-7 font-semibold">{value}</dd></div>
      ))}
    </dl>
    <div className="mt-4 border-t border-sep pt-3">
      <p className="text-footnote text-label-2">Dénivelé équivalent prévu <span className="num font-medium text-label">{Math.round(s.ascent_m)} m</span></p>
      {energy.weight_kg === null ? editing
        ? <p className="mt-2 text-footnote text-label-2">Pour les calories, renseignez votre poids dans Réglages après avoir enregistré la séance.</p>
        : <a href={href.settings} className="pressable -mb-1 flex min-h-11 items-center text-footnote font-medium text-accent">Renseigner mon poids pour les calories →</a>
        : <details className="mt-1 text-footnote text-label-2">
          <summary className="min-h-11 cursor-pointer content-center text-accent">Comprendre l’estimation</summary>
          <div className="space-y-2 pb-2 leading-relaxed">
            <p><span className="num font-medium text-label">≈ {Math.round(energy.total_kcal!)} kcal totales</span>, dont les calories actives affichées ci-dessus. Le total inclut une dépense de repos standard.</p>
            <p>Calcul ACSM avec le poids actuel du profil ({dec1(energy.weight_kg)} kg), la durée, la vitesse et la pente de chaque segment. Le dénivelé représente une montée équivalente sur cette distance.</p>
            {energy.automatic_gait && <p>En mode Auto : marche jusqu’à 6 km/h, course au-delà. Vous pouvez préciser le déplacement dans l’éditeur.</p>}
            {energy.outside_range && <p className="text-orange">Certains blocs sont hors des plages de vitesse les mieux adaptées au calcul : marche de 3 à 6 km/h, course à partir d’environ 8 km/h. L’estimation y est plus incertaine.</p>}
            <p>Ce sont des prévisions, pas des calories mesurées. Les changements rapides d’allure, l’appui sur les poignées et les différences individuelles peuvent modifier la dépense réelle.</p>
            {!editing && <a href={href.settings} className="inline-flex min-h-11 items-center font-medium text-accent">Modifier mon poids →</a>}
          </div>
        </details>}
    </div>
    <ProgrammeChart blocks={data.blocks} className="mt-5" />
  </>
}

export function WorkoutLoading() {
  return <div role="status" className="rounded-[22px] bg-surface p-5 text-subhead text-label-2">Chargement des séances…</div>
}

export function WorkoutError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="rounded-[14px] bg-red/15 p-4">
    <p className="text-subhead text-red">{message}</p>
    <Button size="md" variant="plain" onClick={retry} className="mt-2">Réessayer</Button>
  </div>
}
