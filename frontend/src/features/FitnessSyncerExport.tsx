import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button, Disclosure, Facts, Sheet } from '../components/ui'
import { clock } from '../lib/format'
import type { Recording } from '../lib/recordings'
import { workoutExport } from '../lib/workoutExport'
import {
  FITNESS_SYNCER_ACTIVITIES, FITNESS_SYNCER_NOTEBOOK, FITNESS_SYNCER_SIGN_IN,
  fitnessSyncerCalorieOptions, fitnessSyncerDraft, fitnessSyncerExportIssue, fitnessSyncerMeasurements, fitnessSyncerUrl,
  type FitnessSyncerActivity, type FitnessSyncerCalorieChoice,
} from '../lib/fitnessSyncer'

const date = (value: string | number) => new Date(value).toLocaleString('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
})
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 })
const linkStyle = 'pressable inline-flex min-h-11 items-center gap-2 text-subhead font-semibold text-accent underline underline-offset-4'

function lastOpening(key: string): { at: string | null; unavailable: boolean } {
  try {
    const at = localStorage.getItem(key)
    return { at: at && Number.isFinite(Date.parse(at)) ? at : null, unavailable: false }
  } catch { return { at: null, unavailable: true } }
}

export function FitnessSyncerExport({ data }: { data: Recording }) {
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState<FitnessSyncerActivity | null>(null)
  const [calorieChoice, setCalorieChoice] = useState<FitnessSyncerCalorieChoice | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const storageKey = `fitness.fitnessSyncer.opened:${data.profile.id}:${data.id}`
  const [opening, setOpening] = useState(() => lastOpening(storageKey))
  const issue = fitnessSyncerExportIssue(data)
  const summary = issue ? null : workoutExport(data)
  const calorieOptions = fitnessSyncerCalorieOptions(data)
  const selectedCalories = calorieOptions.find(option => option.value === (calorieChoice ?? (calorieOptions.length === 1 ? calorieOptions[0].value : null)))
  const measurements = fitnessSyncerMeasurements(data)
  const draft = !issue && activity && selectedCalories ? fitnessSyncerDraft(data, activity, selectedCalories.value) : null
  const close = () => { setOpen(false); setConfirmed(false) }
  const rememberOpening = () => {
    const at = new Date().toISOString()
    let unavailable = false
    try { localStorage.setItem(storageKey, at) } catch { unavailable = true }
    setOpening({ at, unavailable })
    setConfirmed(false)
  }

  return <section className="mt-5" aria-label="Export FitnessSyncer">
    <Button variant="gray" className="w-full" onClick={() => {
      const stored = lastOpening(storageKey)
      setOpening(previous => stored.unavailable ? { ...stored, at: previous.at } : stored)
      setOpen(true)
    }}><ExternalLink size={18} aria-hidden="true" />Envoyer avec FitnessSyncer</Button>
    <Sheet open={open} onClose={close} title="FitnessSyncer"
      leading={<button className="pressable min-h-11 text-subhead text-accent" onClick={close}>Fermer</button>}
      footer={<div className="space-y-2">
        {draft && confirmed
          ? <a href={fitnessSyncerUrl(draft)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            onClick={rememberOpening} onAuxClick={event => { if (event.button === 1) rememberOpening() }}
            className="pressable flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent px-4 text-headline font-semibold text-on-accent">
            Ouvrir FitnessSyncer<ExternalLink size={17} aria-hidden="true" />
          </a>
          : <Button className="w-full" disabled>Ouvrir FitnessSyncer</Button>}
        <p className="text-center text-footnote text-label-2">Le formulaire s’ouvre dans un nouvel onglet. Vous l’enregistrez ensuite.</p>
      </div>}>
      <div className="space-y-5">
        <div>
          <p className="text-subhead">Connectez-vous d’abord à FitnessSyncer, puis revenez à ce bilan pour préparer la séance.</p>
          <a href={FITNESS_SYNCER_SIGN_IN} target="_blank" rel="noopener noreferrer" className={linkStyle}>Se connecter ou créer un compte<ExternalLink size={15} aria-hidden="true" /></a>
          <p className="text-footnote text-label-2">Gratuit jusqu’à 5 connexions. La séance sera partagée avec FitnessSyncer, puis avec Santé via son application iPhone.</p>
        </div>
        {issue ? <p role="status" className="rounded-[12px] bg-orange/15 p-3 text-subhead text-orange">{issue}</p> : summary && <>
          <Facts rows={[
            ['Profil FitnessApp', data.profile.name],
            ['Départ attendu', date(summary.debut)],
            ['Durée active', clock(summary.duree_secondes)],
            ['Distance', summary.distance_metres === undefined ? 'Non envoyée · mesure incomplète' : `${number.format(summary.distance_metres / 1000)} km`],
            ['Calories actives', selectedCalories ? `≈ ${selectedCalories.kcal} kcal` : 'Estimation à choisir ci-dessous'],
          ]} />
          <fieldset>
            <legend className="mb-2 text-subhead font-semibold">Activité réalisée sur le tapis</legend>
            <div className="grid grid-cols-2 gap-2">
              {FITNESS_SYNCER_ACTIVITIES.map(option => <label key={option.value} className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-[12px] bg-fill-3 px-3 text-subhead">
                <input type="radio" name={`fitness-activity-${data.id}`} checked={activity === option.value}
                  onChange={() => { setActivity(option.value); setConfirmed(false) }} className="size-4 shrink-0 accent-accent" />
                {option.value === 'Walking' ? 'Marche' : 'Course'}
              </label>)}
            </div>
          </fieldset>
          {calorieOptions.length > 1 && <fieldset>
            <legend className="mb-2 text-subhead font-semibold">Calories actives à envoyer</legend>
            <p className="mb-3 text-footnote text-label-2">Le bilan donne une plage car le mouvement marche/course reste incertain. Choisissez une estimation ; la plage et votre choix seront aussi indiqués dans la note.</p>
            <div className="grid grid-cols-2 gap-2">
              {calorieOptions.map(option => <label key={option.value} className="flex min-h-[64px] cursor-pointer items-center gap-2 rounded-[12px] bg-fill-3 px-3 py-2 text-subhead">
                <input type="radio" name={`fitness-calories-${data.id}`} checked={selectedCalories?.value === option.value}
                  onChange={() => { setCalorieChoice(option.value); setConfirmed(false) }} className="size-4 shrink-0 accent-accent" />
                <span>{option.label}<strong className="block text-energy">≈ {option.kcal} kcal</strong></span>
              </label>)}
            </div>
          </fieldset>}
          <p className="text-footnote text-label-2">Calories actives incluses, sans dépense de repos. Leur réception comme énergie active dans Santé reste à vérifier.</p>
          {data.metrics.energy.outside_range && <p className="text-footnote text-orange">L’estimation calorique sort du domaine usuel de la formule : sa précision est plus incertaine.</p>}
          <Disclosure title="Autres données envoyées"><div className="space-y-3 px-4 pb-4">
            <Facts rows={[
              ['Vitesse moyenne', measurements.speedAverage === undefined ? 'Non envoyée · mesure incomplète' : `${number.format(measurements.speedAverage)} km/h`],
              ['Vitesse max. mesurée', measurements.speedMax === undefined ? 'Non disponible' : `${number.format(measurements.speedMax)} km/h`],
              ['Ressenti', measurements.feeling === undefined ? 'Non renseigné' : `${measurements.feeling}/10`],
              ['Pente moyenne · note', measurements.inclineAverage === undefined ? 'Non envoyée · mesure incomplète' : `${number.format(measurements.inclineAverage)} %`],
            ]} />
            <p className="text-footnote text-label-2">Le maximum porte sur les points mesurés conservés. La pente et les limites figurent dans la note FitnessSyncer. Leur affichage dans Santé n’est pas garanti ; les courbes et événements ne sont pas transmis par ce formulaire.</p>
          </div></Disclosure>
          {data.metrics.pause_s > 0 && <p className="text-footnote text-label-2">Pauses exclues : {clock(data.metrics.pause_s)}. Leur chronologie n’est pas transmise ; une fin calculée depuis la durée active sera plus tôt que l’arrêt réel.</p>}
          <p className="text-footnote text-label-2">Aucun pas, tracé GPS ou cardio n’est ajouté. Le nom du profil et le poids restent dans FitnessApp.</p>
          {opening.at && <div role="status" className="rounded-[12px] bg-orange/15 p-3 text-subhead">
            <p className="text-orange">Ouverture déjà demandée le {date(opening.at)}.</p>
            <p className="mt-2">Ce repère ne confirme aucun enregistrement. Consultez le carnet avant de réessayer pour éviter un doublon.</p>
            <a href={FITNESS_SYNCER_NOTEBOOK} target="_blank" rel="noopener noreferrer" className={linkStyle}>Vérifier le carnet<ExternalLink size={15} aria-hidden="true" /></a>
          </div>}
          {opening.unavailable && <p role="status" className="text-footnote text-orange">Le navigateur ne peut pas conserver le repère d’ouverture. Vérifiez le carnet avant chaque nouvel envoi.</p>}
          <label className="flex min-h-11 items-start gap-3 py-2 text-subhead">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
            <span>Ce profil est le mien, je suis connecté au bon compte FitnessSyncer et cette séance n’a pas déjà été importée.</span>
          </label>
        </>}
        <Disclosure title="Premier essai : vérifier jusqu’à Santé"><ol className="list-decimal space-y-3 px-4 pb-4 pl-9 text-subhead">
          <li>Dans le formulaire FitnessSyncer, vérifiez la date, l’heure, l’activité, la durée, l’unité de distance et les calories avant <strong>Save / Enregistrer</strong>. Si une connexion vous a été demandée, revenez ici et ouvrez à nouveau le formulaire.</li>
          <li>Sur l’iPhone, ouvrez FitnessSyncer avec le même compte. Dans <strong>Apple Health / Santé</strong>, activez l’écriture des activités et accordez les autorisations correspondantes, puis touchez <strong>Sync Now</strong>.</li>
          <li>Dans Santé, recherchez <strong>Exercices</strong>, puis <strong>Afficher toutes les données</strong>. Ouvrez la séance à la date attendue et comparez les valeurs ci-dessus. Vérifiez séparément l’énergie active à la même date et sa source FitnessSyncer.</li>
          <li>Dans Forme, contrôlez la présence de la séance et le résultat sur l’anneau Bouger. Aucun résultat sur les anneaux n’est confirmé par FitnessApp.</li>
        </ol></Disclosure>
        <Disclosure title="Si la séance n’arrive pas"><div className="space-y-3 px-4 pb-4 text-subhead">
          <p>Formulaire vide ou date incorrecte : ne l’enregistrez pas. Vérifiez la connexion et le fuseau horaire du compte, puis revenez au bilan. La reprise des champs et leur conversion dans Santé restent à vérifier lors de ce premier essai.</p>
          <p>Présente dans le carnet mais absente de Santé : vérifiez les autorisations d’écriture et relancez seulement la synchronisation dans l’application iPhone. Ne recréez pas la séance.</p>
          <p>Les corrections et suppressions du carnet ne se répercutent pas forcément dans Santé. Vérifiez les deux endroits avant tout nouvel import.</p>
        </div></Disclosure>
      </div>
    </Sheet>
  </section>
}
