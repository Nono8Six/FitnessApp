import { useRef, useState } from 'react'
import { Page } from '../components/Shell'
import { ControlRow, Group, Row, Segmented, Stepper } from '../components/ui'
import { errorMessage } from '../lib/api'
import {
  saveProfile, useCurrentProfile, WEEKLY_GOAL_MAX, WEEKLY_GOAL_MIN, type Profile, type ProfileChanges, type SpeedUnit,
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
  const [draft, setDraft] = useState<Profile[K] | null>(null)
  const [error, setError] = useState<string>()
  const last = useRef(0)
  const save = (value: Profile[K]) => {
    const token = ++last.current
    setDraft(value)
    setError(undefined)
    saveProfile(profile.id, { [field]: value } as ProfileChanges).then(
      () => { if (token === last.current) setDraft(null) },
      (err: unknown) => {
        console.warn('Fitness : enregistrement du profil refusé', err)
        if (token === last.current) {
          setDraft(null)
          setError(errorMessage(err))
        }
      },
    )
  }
  return { value: draft ?? profile[field], error, setError, save }
}

function ProfileSettings({ profile, readOnly }: { profile: Profile; readOnly: boolean }) {
  const goal = useSaved(profile, 'weekly_goal')
  const unit = useSaved(profile, 'speed_unit')
  return (
    <Group header={profile.name}>
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
  const current = useCurrentProfile()
  const health = server.status === 'loading' ? undefined : server.health
  return (
    <Page title="Réglages" back={{ label: 'Aujourd’hui', href: href.today }}>
      <div className="desk:max-w-[760px]">
        {/* Une clé par profil : changer de profil abandonne la saisie et les messages du précédent. */}
        {current && <ProfileSettings key={current.id} profile={current} readOnly={server.status !== 'ok'} />}
        {health && <ApplicationSettings health={health} />}
      </div>
    </Page>
  )
}
