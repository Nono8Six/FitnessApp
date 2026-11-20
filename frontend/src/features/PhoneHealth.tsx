import { useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import { Button, Disclosure, Segmented, Sheet } from '../components/ui'
import { fitnessSyncerExportIssue, type FitnessSyncerActivity } from '../lib/fitnessSyncer'
import { detectPhone, phoneAttemptKey, phoneSaveUrl, phoneSetupKey, readPhoneSetup, shortcutName } from '../lib/phoneHealth'
import type { Recording } from '../lib/recordings'

const phone = () => detectPhone(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
const actionStyle = 'pressable flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 text-headline font-semibold text-on-accent'
const smallAction = 'pressable inline-flex min-h-11 items-center text-subhead font-semibold text-accent'

function AppleSetup({ activity }: { activity: FitnessSyncerActivity }) {
  return <div className="space-y-3">
    <p>Créez une fois le raccourci <strong>{shortcutName(activity)}</strong> dans Raccourcis. Au premier lancement, autorisez l’écriture dans Santé.</p>
    <a className={smallAction} href="shortcuts://create-shortcut">Ouvrir l’éditeur de Raccourcis</a>
    <Disclosure title="Créer le raccourci"><ol className="list-decimal space-y-3 px-4 pb-4 pl-9 text-subhead">
      <li>Ajoutez <strong>Obtenir le dictionnaire à partir de l’entrée</strong>. Prenez <strong>Entrée du raccourci</strong> et nommez le résultat <strong>Séance</strong>.</li>
      <li>Avec <strong>Obtenir la valeur du dictionnaire</strong>, lisez dans Séance les clés <code>debut</code>, <code>duree_secondes</code> et <code>calories_actives</code>. Convertissez le départ avec <strong>Obtenir les dates de l’entrée</strong>.</li>
      <li>Avec <strong>Obtenir toutes les clés</strong> de Séance, ajoutez <strong>Si</strong> la liste contient <code>distance_metres</code>. Dans ce cas, lisez la distance puis ajoutez <strong>Enregistrer un entraînement</strong> avec cette distance en mètres. Dans <strong>Sinon</strong>, ajoutez la même action en laissant la distance vide.</li>
      <li>Dans les deux actions, fixez le type à <strong>{activity === 'Running' ? 'Course' : 'Marche'}</strong>, le départ à la date convertie, la durée aux secondes et l’énergie aux kcal. Utilisez les variables issues du dictionnaire pour éviter la ressaisie à chaque séance.</li>
    </ol></Disclosure>
  </div>
}

export function PhoneHealth({ profile, data }: { profile: { id: string; name: string }; data?: Recording }) {
  const device = phone()
  const [initial] = useState(() => {
    try {
      const setup = readPhoneSetup()
      const attempted = !!data && !!localStorage.getItem(phoneAttemptKey(profile.id, data.id))
      return { setup, attempted, error: '' }
    } catch { return { setup: null, attempted: false, error: 'Réglages Santé illisibles. Vérifiez le stockage du navigateur puis configurez ce téléphone.' } }
  })
  const [setup, setSetup] = useState(initial.setup)
  const [attempted, setAttempted] = useState(initial.attempted)
  const [error, setError] = useState(initial.error)
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState<FitnessSyncerActivity>(setup?.activity ?? 'Walking')
  const [calorieRule, setCalorieRule] = useState<'low' | 'high'>(setup?.calories ?? 'low')
  const [confirmed, setConfirmed] = useState(false)
  const matches = !!setup && setup.profile === profile.id && setup.system === device
  const issue = data ? fitnessSyncerExportIssue(data) : null
  const destination = device === 'iphone' ? 'Apple Santé' : 'Santé Connect'
  const href = data && matches && !issue ? phoneSaveUrl(data, setup, window.location.origin) : null

  function configure() {
    setActivity(setup?.activity ?? 'Walking')
    setCalorieRule(setup?.calories ?? 'low')
    setConfirmed(false)
    setOpen(true)
  }

  function saveSetup() {
    if (!confirmed || !device) return
    try {
      const token = setup?.token ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
      const next = { system: device, profile: profile.id, name: profile.name, activity, calories: calorieRule, token }
      localStorage.setItem(phoneSetupKey, JSON.stringify(next))
      setSetup(next); setError(''); setOpen(false)
    } catch { setError('Impossible de mémoriser ce réglage. Autorisez le stockage local dans votre navigateur.') }
  }

  function markLaunch(event: MouseEvent<HTMLAnchorElement>) {
    if (!data) { event.preventDefault(); return }
    try {
      const current = readPhoneSetup()
      if (!current || JSON.stringify(current) !== JSON.stringify(setup)) {
        event.preventDefault(); setError('Le réglage Santé a changé dans un autre onglet. Rechargez le bilan.'); return
      }
      const key = phoneAttemptKey(profile.id, data.id)
      if (device === 'iphone' && localStorage.getItem(key)) {
        event.preventDefault(); setAttempted(true); return
      }
      localStorage.setItem(key, new Date().toISOString())
      setAttempted(true); setError('')
    } catch { event.preventDefault(); setError('Le navigateur ne peut pas conserver la trace de cet envoi. Vérifiez son stockage local.') }
  }

  function allowRetry() {
    if (!data) return
    try { localStorage.removeItem(phoneAttemptKey(profile.id, data.id)); setAttempted(false); setError('') }
    catch { setError('Impossible de réinitialiser la demande dans ce navigateur.') }
  }

  return <section className="mt-5 space-y-1" aria-label="Enregistrement sur le téléphone">
    {data && issue ? <p className="text-footnote text-label-2">{issue}</p> : data && href && !(device === 'iphone' && attempted)
      ? <a className={actionStyle} href={href} onClick={markLaunch}><Heart size={18} aria-hidden="true" />Enregistrer la séance</a>
      : (!data || !matches) && <Button className="w-full" variant={data ? 'primary' : 'gray'} onClick={configure}>
          <Heart size={18} aria-hidden="true" />{matches ? 'Réglages de l’enregistrement Santé' : 'Configurer l’enregistrement Santé'}
        </Button>}
    {data && matches && !issue && <div className="flex flex-wrap items-center justify-between gap-x-2">
      <span className="text-footnote text-label-2">{profile.name} · {destination} · {setup.activity === 'Running' ? 'Course' : 'Marche'}{data.metrics.energy.movement_ambiguous && ` · estimation ${setup.calories === 'low' ? 'basse' : 'haute'}`}</span>
      <button className={smallAction} onClick={configure}>Modifier</button>
    </div>}
    {data && attempted && matches && <div role="status" className="space-y-1 rounded-[12px] bg-fill-3 px-3 py-2 text-footnote">
      {device === 'iphone' ? <>Ouverture de Raccourcis demandée. Vérifiez l’exercice dans Santé avant de recommencer.
        <button className={'block ' + smallAction} onClick={allowRetry}>J’ai vérifié son absence · permettre un nouvel essai</button></>
        : 'Ouverture de FitnessApp Santé demandée. Le compagnon confirme l’écriture sur le téléphone.'}
    </div>}
    {error && !open && <p role="alert" className="text-footnote text-red">{error}</p>}
    <Sheet open={open} onClose={() => setOpen(false)} title="Enregistrement Santé"
      leading={<button className={smallAction} onClick={() => setOpen(false)}>Fermer</button>}
      footer={device && <Button className="w-full" disabled={!confirmed} onClick={saveSetup}>Enregistrer les réglages</Button>}>
      <div className="space-y-5 text-subhead">
        {!device ? <p>Ouvrez FitnessApp sur votre téléphone avec l’adresse Wi-Fi du PC, puis choisissez votre profil. Sur Android, utilisez Chrome. Sur iPhone, utilisez Safari ou Chrome.</p> : <>
          <p><strong>{profile.name}</strong> · {destination}</p>
          {setup && setup.profile !== profile.id && <p className="text-orange">Ce navigateur est associé à {setup.name}. Changer le profil remplace cette association.{device === 'android' && ' Ouvrez aussi FitnessApp Santé pour dissocier l’ancien profil.'}</p>}
          {device === 'android' && <div><p>Installez le compagnon local sur Android 14 ou plus récent. À la première séance, confirmez le profil et les autorisations Santé Connect.</p>
            <a href="/fitness-sante.apk" download="fitness-sante.apk" className={smallAction}>Installer FitnessApp Santé (.apk)</a></div>}
          <fieldset className="space-y-3"><legend className="font-semibold">Activité habituelle</legend>
            <Segmented label="Activité habituelle" value={activity} onChange={setActivity} options={[{ value: 'Walking', label: 'Marche' }, { value: 'Running', label: 'Course' }]} />
          </fieldset>
          <fieldset className="space-y-3"><legend className="font-semibold">Si le bilan donne deux estimations de calories</legend>
            <Segmented label="Estimation à enregistrer" value={calorieRule} onChange={setCalorieRule} options={[{ value: 'low', label: 'Estimation basse' }, { value: 'high', label: 'Estimation haute' }]} />
          </fieldset>
          {device === 'iphone' && <AppleSetup activity={activity} />}
          <p className="text-footnote text-label-2">Le bouton du bilan utilisera ces choix. L’heure de fin est calculée à partir du départ et de la durée hors pauses.</p>
          <label className="flex min-h-11 items-start gap-3"><input className="mt-1 size-5 shrink-0 accent-accent" type="checkbox" checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)} /><span>J’associe ce téléphone au profil {profile.name}. {device === 'iphone' ? 'J’ai configuré le raccourci indiqué.' : 'J’ai installé FitnessApp Santé.'}</span></label>
        </>}
        {error && <p role="alert" className="text-red">{error}</p>}
      </div>
    </Sheet>
  </section>
}
