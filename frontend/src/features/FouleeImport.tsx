import { FileUp } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Page, showProfiles } from '../components/Shell'
import { Button, Sheet } from '../components/ui'
import { clock } from '../lib/format'
import { fouleeDraft, fouleeRunningSpeed, FOULEE_SPEED_RANGE, readFouleeTransfer, readFouleeWorkout, type FouleeWorkout } from '../lib/foulee'
import type { Profile } from '../lib/profiles'
import { href, navigate } from '../lib/router'
import type { WorkoutInput } from '../lib/workouts'
import { Editor } from './Editor'

const MAX_FILE_BYTES = 64 * 1024

export function FouleeImport({ onClose, onImport, received }: {
  onClose: () => void; onImport: (draft: WorkoutInput) => void; received?: FouleeWorkout
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const formId = useId()
  const speedHintId = useId()
  const [workout, setWorkout] = useState(received)
  const [speedText, setSpeedText] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const missing = workout?.missingSpeeds ?? 0
  const speed = fouleeRunningSpeed(speedText)
  const invalidSpeed = !!speedText.trim() && speed === null
  const ready = !reading && workout && (missing === 0 || speed !== null)

  async function read(file: File) {
    setWorkout(undefined)
    setSpeedText('')
    setError('')
    if (file.size > MAX_FILE_BYTES) {
      setError('Ce fichier est trop volumineux. Choisissez l’export JSON d’une seule séance.')
      return
    }
    setReading(true)
    try {
      const text = await file.text().catch(cause => {
        console.warn('Fitness · lecture du fichier Foulée impossible', cause)
        throw new Error('Le fichier n’a pas pu être lu. Sélectionnez-le de nouveau.')
      })
      setWorkout(readFouleeWorkout(text))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le fichier n’a pas pu être importé.')
    } finally {
      setReading(false)
    }
  }

  return <Sheet open onClose={onClose} title="Importer depuis Foulée"
    leading={<button type="button" className="pressable h-11 text-subhead text-accent" onClick={onClose}>Annuler</button>}
    footer={<Button type="submit" form={formId} className="w-full" disabled={!ready}>Ouvrir dans l’éditeur</Button>}>
    <form id={formId} className="grid min-w-0 gap-4" onSubmit={event => {
      event.preventDefault()
      if (ready) onImport(fouleeDraft(workout, speed))
    }}>
      {!received && <>
        {!workout && <p className="text-subhead text-label-2">Dans Foulée, ouvrez une séance et touchez « Exporter les blocs JSON ».</p>}
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={event => {
          const file = event.target.files?.[0]
          // Permet de choisir à nouveau le même fichier après une erreur.
          event.target.value = ''
          if (file) void read(file)
        }} />
        <Button type="button" variant="gray" disabled={reading} onClick={() => fileInput.current?.click()}>
          <FileUp size={18} aria-hidden />{reading ? 'Lecture du fichier…' : workout ? 'Changer de fichier' : 'Choisir un fichier JSON'}
        </Button>
        {error && <p role="alert" className="text-subhead text-red">{error}</p>}
      </>}
      {workout && <div className="min-w-0 rounded-[12px] bg-surface-2 px-4 py-3" role="status">
        <p className="break-words text-headline">{workout.name}</p>
        <p className="mt-0.5 text-subhead text-label-2">{workout.blocks.length} {workout.blocks.length === 1 ? 'bloc' : 'blocs'} · {clock(workout.blocks.reduce((sum, block) => sum + block.sec, 0))}</p>
      </div>}
      {missing > 0 && <div>
        <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] bg-surface-2 px-4">
          <span className="min-w-0 grow text-body">Allure de course <span className="sr-only">(km/h)</span></span>
          <input className="num h-11 w-16 rounded-[8px] bg-fill-3 px-2 text-right text-headline"
            inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="—" required value={speedText}
            onChange={event => setSpeedText(event.target.value)} aria-invalid={invalidSpeed} aria-describedby={speedHintId} />
          <span className="text-subhead text-label-2" aria-hidden>km/h</span>
        </label>
        <p id={speedHintId} className={`mt-2 text-footnote ${invalidSpeed ? 'text-red' : 'text-label-2'}`}>
          {invalidSpeed ? FOULEE_SPEED_RANGE : missing === 1 ? 'Cette allure complète le bloc de course sans vitesse.' : `Cette allure complète les ${missing} blocs sans vitesse.`}
        </p>
      </div>}
    </form>
  </Sheet>
}

export function FouleeTransfer({ query, profile, onImport }: {
  query: string; profile: Profile; onImport: (draft: WorkoutInput) => void
}) {
  const [result] = useState(() => {
    try {
      return { workout: readFouleeTransfer(query) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'La séance n’a pas pu être reçue.' }
    }
  })
  const workout = result.workout
  const profileMatches = workout?.athlete?.normalize('NFC').toLocaleLowerCase('fr') === profile.name.normalize('NFC').toLocaleLowerCase('fr')
  if (workout && profileMatches && !workout.missingSpeeds) return <Editor profile={profile.id} imported={fouleeDraft(workout, null)} />

  return <Page title="Séance Foulée" back={{ label: 'Séances', href: href.myWorkouts }}>
    {result.error && <p role="alert" className="text-subhead text-red">{result.error}</p>}
    {workout && !profileMatches && <div className="space-y-4">
      <p className="text-subhead text-label-2">Cette séance est prévue pour {workout.athlete}. Le profil actif dans FitnessApp est {profile.name}.</p>
      <Button type="button" size="md" variant="gray" onClick={showProfiles}>Changer de profil</Button>
    </div>}
    {workout && profileMatches && <FouleeImport received={workout} onImport={onImport} onClose={() => navigate(href.myWorkouts)} />}
  </Page>
}
