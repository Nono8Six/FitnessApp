import { useState } from 'react'
import { Heart } from 'lucide-react'
import { Button, Disclosure, Facts, Sheet } from '../components/ui'
import { APPLE_SHORTCUT_NAME, appleExportIssue, appleShortcutUrl, appleWorkout } from '../lib/appleHealth'
import { clock, dec1 } from '../lib/format'
import { recordingDate, type Recording } from '../lib/recordings'

function ShortcutSetup() {
  return <div className="space-y-4 px-4 pb-4 text-subhead">
    <p>À créer une fois sur l’iPhone dans l’app gratuite Raccourcis. Aucun compte Strava ni abonnement.</p>
    <ol className="list-decimal space-y-4 pl-5">
      <li>Créez un raccourci nommé exactement <strong>{APPLE_SHORTCUT_NAME}</strong>.</li>
      <li>Ajoutez <strong>Obtenir le dictionnaire à partir de l’entrée</strong> et choisissez <strong>Entrée du raccourci</strong>. Nommez le résultat <strong>Séance</strong>.</li>
      <li>Avec <strong>Obtenir la valeur du dictionnaire</strong>, récupérez <strong>debut</strong> et <strong>duree_secondes</strong> depuis <strong>Séance</strong>. Renommez chaque résultat avec le nom de sa clé. Les deux autres clés sont facultatives : récupérez-les seulement dans les branches où elles existent.
        <dl className="mt-2 space-y-2 text-footnote">
          <div><dt className="font-semibold">debut</dt><dd>Date du départ. Passez le résultat dans l’action Dates pour obtenir une date.</dd></div>
          <div><dt className="font-semibold">duree_secondes</dt><dd>Durée active, en secondes.</dd></div>
          <div><dt className="font-semibold">distance_metres</dt><dd>Distance en mètres ; clé absente si la mesure est incomplète.</dd></div>
          <div><dt className="font-semibold">calories_actives</dt><dd>Kcal actives estimées ; clé absente si elles ne sont pas disponibles ou complètes.</dd></div>
        </dl>
      </li>
      <li>Ajoutez <strong>Afficher l’alerte</strong> avec Annuler : « Enregistrer cette séance dans Santé ? Vérifiez qu’elle n’y figure pas déjà et que le profil FitnessApp est le vôtre. »</li>
      <li>Ajoutez l’action Santé <strong>Enregistrer un entraînement</strong> (Log Workout). Pour le type, utilisez <strong>Demander à chaque fois</strong> et choisissez Marche ou Course à l’envoi. Pour la date et la durée, insérez les variables <strong>debut</strong> convertie en date et <strong>duree_secondes</strong>, avec l’unité <strong>secondes</strong>.
        <p className="mt-2">Pour les valeurs facultatives, récupérez <strong>Toutes les clés</strong> de Séance. Avec des actions <strong>Si la liste contient</strong>, cherchez <strong>distance_metres</strong>, puis <strong>calories_actives</strong>. Placez une action d’enregistrement dans chacune des quatre branches : les deux valeurs, distance seule, calories seules, aucune. Dans chaque branche, récupérez uniquement les valeurs présentes. Insérez-les dans les options de l’entraînement en <strong>mètres</strong> et en <strong>kcal</strong> ; laissez les champs absents vides. Une seule branche doit enregistrer l’entraînement.</p>
      </li>
      <li>Après ces conditions, ajoutez <strong>Afficher l’alerte</strong> : « Entraînement enregistré. Vérifiez les valeurs dans Santé. » Au premier envoi, autorisez les écritures demandées par Santé.</li>
    </ol>
    <p className="text-footnote text-label-2">Les libellés peuvent varier selon iOS. La configuration et le premier enregistrement restent à vérifier sur votre iPhone.</p>
  </div>
}

export function AppleHealthExport({ data }: { data: Recording }) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const issue = appleExportIssue(data)
  const workout = issue ? null : appleWorkout(data)
  const appleDevice = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const close = () => { setOpen(false); setConfirmed(false) }

  return <section className="mt-5" aria-label="Export Apple Santé">
    <Button variant="gray" className="w-full" onClick={() => setOpen(true)}><Heart size={18} aria-hidden="true" />Envoyer vers Apple Santé</Button>
    <Sheet open={open} onClose={close} title="Apple Santé"
      leading={<button className="pressable min-h-11 text-subhead text-accent" onClick={close}>Fermer</button>}
      footer={<div className="space-y-2">
        {appleDevice && workout && !issue && confirmed
          ? <a className="pressable flex min-h-[52px] items-center justify-center rounded-[14px] bg-accent px-4 text-headline font-semibold text-on-accent"
            href={appleShortcutUrl(workout)} onClick={event => {
              event.preventDefault()
              setLaunchError(''); setAttempted(true); setConfirmed(false)
              try { window.location.assign(appleShortcutUrl(workout)) }
              catch { setLaunchError('Impossible d’ouvrir Raccourcis. Vérifiez son installation sur cet iPhone.') }
            }}>Ouvrir Raccourcis</a>
          : <Button className="w-full" disabled>Ouvrir Raccourcis</Button>}
        {!appleDevice && <p className="text-center text-footnote text-label-2">Ouvrez ce bilan dans Chrome sur votre iPhone.</p>}
      </div>}>
      <div className="space-y-5 px-4 pb-5">
        <p className="text-subhead text-label-2">Envoi gratuit avec Raccourcis Apple, à configurer une fois ci-dessous.</p>
        {issue ? <p role="status" className="rounded-[12px] bg-orange/15 p-3 text-subhead text-orange">{issue}</p> : workout && <>
          <Facts rows={[
            ['Profil FitnessApp', data.profile.name],
            ['Départ', recordingDate(workout.debut)],
            ['Durée active', clock(workout.duree_secondes)],
            ['Distance', workout.distance_metres === undefined ? 'Non envoyée' : `${dec1(workout.distance_metres)} m`],
            ['Kcal actives estimées', workout.calories_actives === undefined ? 'Non envoyées' : `≈ ${dec1(workout.calories_actives)} kcal`],
          ]} />
          <p className="text-subhead">Choisissez Marche ou Course dans Raccourcis au moment de l’enregistrement.</p>
          <p className="text-footnote text-label-2">Les valeurs absentes ou incomplètes ne sont pas envoyées. Les calories restent une estimation. Aucun pas n’est ajouté.</p>
          {data.metrics.pause_s > 0 && <p className="text-footnote text-label-2">Pauses exclues de la durée. Raccourcis ne conserve pas leur chronologie : la fin de l’entraînement sera calculée depuis le départ et la durée active.</p>}
          {attempted && <p role="status" className="rounded-[12px] bg-orange/15 p-3 text-subhead text-orange">Ouverture de Raccourcis demandée. FitnessApp ne peut pas vérifier l’enregistrement dans Santé. Vérifiez-le sur l’iPhone avant tout nouvel envoi.</p>}
          {launchError && <p role="alert" className="text-subhead text-red">{launchError}</p>}
          <label className="flex min-h-11 items-start gap-3 py-2 text-subhead">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
            <span>Le raccourci est configuré, ce profil est le mien et cette séance n’est pas déjà dans Santé.</span>
          </label>
        </>}
        <Disclosure title="Configurer le raccourci sur l’iPhone"><ShortcutSetup /></Disclosure>
        <Disclosure title="Si l’envoi ne fonctionne pas"><div className="space-y-3 px-4 pb-4 text-subhead">
          <p>Si rien ne s’ouvre, vérifiez que Raccourcis est installé et que le nom est exactement « {APPLE_SHORTCUT_NAME} ». Autorisez Chrome à ouvrir Raccourcis si iOS le demande.</p>
          <p>Si Santé refuse l’enregistrement, vérifiez ses autorisations pour Raccourcis. Une action peut avoir réussi avant une erreur : consultez vos entraînements avant de réessayer.</p>
          <p>Si une montre a déjà enregistré cette séance, gardez un seul enregistrement. Les anneaux et l’affichage dans Forme dépendent des règles d’Apple.</p>
        </div></Disclosure>
      </div>
    </Sheet>
  </section>
}
