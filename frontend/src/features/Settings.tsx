import { useRef, useState } from 'react'
import { Page } from '../components/Shell'
import { Button, ControlRow, Group, Row, Segmented, Sheet, Stepper } from '../components/ui'
import { errorMessage } from '../lib/api'
import {
  deleteProfile, NAME_MAX, saveProfile, useCurrentProfile, useProfiles, WEEKLY_GOAL_MAX, WEEKLY_GOAL_MIN,
  type Profile, type ProfileChanges, type SpeedUnit,
} from '../lib/profiles'
import { href } from '../lib/router'
import { useServer, type Health } from '../lib/server'

const UNITS: { value: SpeedUnit; label: string }[] = [
  { value: 'kmh', label: 'km/h' },
  { value: 'pace', label: 'min/km' },
]

/**
 * Valeur affichée pendant l’enregistrement, puis celle du serveur.
 * Un refus restaure la valeur enregistrée et donne le message à afficher sous la ligne.
 */
function useSaved<K extends keyof ProfileChanges>(profile: Profile, field: K) {
  const [draft, setDraft] = useState<Profile[K] | undefined>(undefined)
  const [error, setError] = useState<string>()
  const last = useRef(0)
  const save = (value: Profile[K]) => {
    const token = ++last.current
    setDraft(value)
    setError(undefined)
    saveProfile(profile.id, { [field]: value } as ProfileChanges).then(
      () => { if (token === last.current) setDraft(undefined) },
      (err: unknown) => {
        console.warn('Fitness : enregistrement du profil refusé', err)
        if (token === last.current) {
          setDraft(undefined)
          setError(errorMessage(err))
        }
      },
    )
  }
  return { value: draft === undefined ? profile[field] : draft, saving: draft !== undefined, error, setError, save }
}

function WeightInput({ value, onChange, onInvalid, disabled, error }: {
  value: number | null; onChange: (value: number | null) => void
  onInvalid: (message: string | undefined) => void; disabled: boolean; error?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const formatted = value === null ? '' : String(value).replace('.', ',')
  const commit = () => {
    if (draft === null) return
    const text = draft.trim()
    const weight = text === '' ? null : Number(text.replace(',', '.'))
    if (weight !== null && (!/^\d+(?:[.,]\d+)?$/.test(text) || !Number.isFinite(weight) || weight < 20 || weight > 300)) {
      onInvalid('Saisissez un poids de 20 à 300 kg, ou videz le champ pour l’effacer.')
      return
    }
    setDraft(null); onInvalid(undefined)
    if (weight !== value) onChange(weight)
  }
  return <div className="flex items-baseline gap-1">
    <input aria-label="Poids (kg)" aria-invalid={!!error} inputMode="decimal" enterKeyHint="done" autoComplete="off"
      disabled={disabled} value={draft ?? formatted} placeholder="À renseigner"
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); onInvalid(undefined) } }}
      className="num h-11 w-32 rounded-[8px] bg-transparent px-2 text-right text-body outline-none placeholder:text-label-3 focus:bg-fill-3 disabled:text-label-3" />
    <span className="text-subhead text-label-2">kg</span>
  </div>
}

/** Nom modifiable sur place, enregistré à la sortie du champ ou avec Entrée ; Échap annule. */
function NameInput({ value, onChange, onInvalid, disabled }: {
  value: string
  onChange: (v: string) => void
  onInvalid: (message: string | undefined) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const name = draft.trim()
    if (!name) {
      onInvalid('Nom requis')
      return
    }
    setDraft(null)
    onInvalid(undefined)
    if (name !== value) onChange(name)
  }
  return (
    <input
      aria-label="Nom"
      maxLength={NAME_MAX}
      autoComplete="off"
      enterKeyHint="done"
      disabled={disabled}
      value={draft ?? value}
      onFocus={() => setDraft((d) => d ?? value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(null); onInvalid(undefined) }
      }}
      className="h-11 w-full min-w-0 rounded-[8px] bg-transparent px-2 text-right text-body text-label-2 outline-none focus:bg-fill-3 focus:text-label disabled:text-label-3"
    />
  )
}

/** Confirmation avant suppression : le profil et toutes ses données disparaissent. */
function DeleteProfile({ profile, readOnly }: { profile: Profile; readOnly: boolean }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState(false)
  const close = () => { if (!deleting) setOpen(false) }
  const confirm = async () => {
    setDeleting(true)
    setError(undefined)
    try {
      await deleteProfile(profile.id)
    } catch (err) {
      console.warn('Fitness : suppression du profil refusée', err)
      setError(errorMessage(err))
      setDeleting(false)
    }
    // En cas de succès, ce composant disparaît avec le profil supprimé.
  }
  return (
    <>
      <Group className="mt-6">
        <button type="button" disabled={readOnly} onClick={() => { setError(undefined); setOpen(true) }}
          className="g-row flex min-h-11 w-full items-center justify-center px-4 text-body text-red active:bg-fill-4 desk:hover:bg-fill-4 disabled:text-label-3">
          Supprimer le profil
        </button>
      </Group>
      <Sheet open={open} onClose={close} title="Supprimer le profil"
        leading={<button type="button" onClick={close} className="pressable -ml-2 h-11 min-w-11 px-2 text-body text-accent">Annuler</button>}>
        <p className="px-1 pt-2 text-subhead break-words text-label-2">Les réglages et toutes les données de {profile.name} seront supprimés de ce PC.</p>
        {error && <p role="alert" className="mt-3 px-1 text-footnote text-red">{error}</p>}
        <Button variant="danger" className="mt-6 w-full" onClick={confirm} disabled={deleting}>Supprimer</Button>
      </Sheet>
    </>
  )
}

function ProfileSettings({ profile, readOnly }: { profile: Profile; readOnly: boolean }) {
  const name = useSaved(profile, 'name')
  const goal = useSaved(profile, 'weekly_goal')
  const unit = useSaved(profile, 'speed_unit')
  const weight = useSaved(profile, 'weight_kg')
  return (
    <>
    <Group header={profile.name}>
      <ControlRow
        title="Nom"
        error={name.error}
        control={<div className="w-[180px] max-w-[45vw]"><NameInput value={name.value} onChange={name.save} onInvalid={name.setError} disabled={readOnly} /></div>}
      />
      <ControlRow
        title="Séances par semaine"
        error={goal.error}
        control={
          <Stepper value={goal.value} min={WEEKLY_GOAL_MIN} max={WEEKLY_GOAL_MAX} label="Séances par semaine"
            disabled={readOnly} onChange={goal.save} onInvalid={goal.setError} />
        }
      />
      <ControlRow
        title="Unité"
        error={unit.error}
        control={<Segmented options={UNITS} value={unit.value} onChange={unit.save} label="Unité" disabled={readOnly} className="w-[148px]" />}
      />
    </Group>
    <Group header="Estimation des calories" className="mt-9">
      <ControlRow title="Poids" error={weight.error}
        control={<WeightInput value={weight.value} onChange={weight.save} onInvalid={weight.setError}
          error={weight.error} disabled={readOnly || weight.saving} />} />
      <p className="px-4 pt-1 pb-4 text-footnote text-label-2" role={weight.saving ? 'status' : undefined}>
        {weight.saving ? 'Enregistrement…' : 'Utilisé avec la vitesse, la pente et le type de déplacement de chaque bloc. Videz le champ pour retirer votre poids.'}
      </p>
    </Group>
    </>
  )
}

function ApplicationSettings({ health }: { health: Health }) {
  const port = location.port || (location.protocol === 'https:' ? '443' : '80')
  const phones = health.network.enabled ? health.network.addresses : []
  return (
    <Group header="Application" className="mt-9">
      <Row title="Version" trailing={<span className="num select-text">{health.version}</span>} />
      <Row title="Mode" trailing={health.mode === 'simulation' ? 'Simulation' : 'Réel'} />
      <Row title="Schéma" trailing={<span className="num select-text">{health.schema}</span>} />
      <Row title="Dossier de données" subtitle={<span className="cursor-text break-all select-all">{health.data_dir}</span>} />
      {phones.map((address) => (
        <Row key={address} title="Adresse téléphone"
          subtitle={<span className="cursor-text break-all select-all">{`http://${address}:${port}`}</span>} />
      ))}
    </Group>
  )
}

export function Settings() {
  const server = useServer()
  const profiles = useProfiles()
  const current = useCurrentProfile()
  const count = profiles.status === 'loading' ? 0 : profiles.profiles?.length ?? 0
  const readOnly = server.status !== 'ok'
  const health = server.status === 'loading' ? undefined : server.health
  return (
    <Page title="Réglages" back={{ label: 'Aujourd’hui', href: href.today }}>
      <div className="desk:max-w-[760px]">
        {/* Une clé par profil : changer de profil abandonne la saisie et les messages du précédent. */}
        {current && <ProfileSettings key={current.id} profile={current} readOnly={readOnly} />}
        {/* Le dernier profil ne peut pas être supprimé : la ligne n’apparaît qu’avec au moins deux profils. */}
        {current && count > 1 && <DeleteProfile key={current.id} profile={current} readOnly={readOnly} />}
        {health && <ApplicationSettings health={health} />}
      </div>
    </Page>
  )
}
