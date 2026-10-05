import { Bluetooth, BluetoothSearching, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button, Disclosure, Facts, Group, Row, Sheet, StatGrid, StatusLabel, Tile } from '../components/ui'
import { useDevice, type DeviceRange, type DeviceState, type MeasurementKey } from '../lib/device'

const phases: Record<DeviceState['phase'], string> = {
  disconnected: 'Non connecté', scanning: 'Recherche…', connecting: 'Connexion…', connected: 'Connecté', disconnecting: 'Déconnexion…',
}
const number = (value: number, digits = 1) => value.toLocaleString('fr-FR', { maximumFractionDigits: digits })
const range = (value?: DeviceRange, unit = '') => value ? `${number(value.min)}–${number(value.max)} ${unit}` : 'Non lue'
const metricInfo = [
  { key: 'speed_kmh', label: 'Vitesse', unit: 'km/h', color: 'var(--color-speed)' },
  { key: 'incline_pct', label: 'Pente', unit: '%', color: 'var(--color-incline)' },
  { key: 'distance_m', label: 'Distance', unit: 'km', color: 'var(--color-distance)' },
  { key: 'elapsed_s', label: 'Temps tapis', color: 'var(--color-time)' },
  { key: 'heart_rate_bpm', label: 'Cardio', unit: 'bpm', color: 'var(--color-heart)' },
  { key: 'energy_kcal', label: 'Kcal tapis', unit: 'kcal', color: 'var(--color-energy)' },
] as const

export function TreadmillSettings({ readOnly, initialOpen = false }: { readOnly: boolean; initialOpen?: boolean }) {
  const device = useDevice()
  const [open, setOpen] = useState(initialOpen)
  const [searched, setSearched] = useState(false)
  const s = device.data?.state
  const live = device.status === 'live'
  const connected = s?.phase === 'connected'
  const busy = !!device.pending || (!!s && !['connected', 'disconnected'].includes(s.phase))
  const disabled = readOnly || !live || busy
  const staleAfter = s?.stale_after_s ?? 5
  const status = device.status === 'offline' ? <StatusLabel tone="red">État indisponible</StatusLabel>
    : !s ? <StatusLabel tone="gray">Chargement…</StatusLabel>
    : connected ? <StatusLabel tone="green">{phases.connected}</StatusLabel>
    : busy ? <StatusLabel tone="orange" pulse>{phases[s.phase]}</StatusLabel>
    : <StatusLabel tone="gray">{phases[s.phase]}</StatusLabel>
  const age = (key: MeasurementKey) => {
    const value = s?.measurements[key].age_s
    return value === undefined || value === null ? null : value + Math.max(0, (device.now - (device.data?.receivedAt ?? device.now)) / 1000)
  }
  const value = (key: MeasurementKey) => {
    const m = s?.measurements[key]
    const seconds = age(key)
    if (!connected || !live || m?.quality !== 'fresh' || seconds === null || seconds > staleAfter
      || m.value === null || (key === 'heart_rate_bpm' && (m.value <= 0 || m.value >= 255))) return null
    if (key === 'elapsed_s') return `${Math.floor(m.value / 60)}:${String(Math.floor(m.value % 60)).padStart(2, '0')}`
    return key === 'distance_m' ? number(m.value / 1000, 2) : number(m.value)
  }
  const missing = live && (['speed_kmh', 'incline_pct'] as const).some(key => value(key) === null)
  const stale = (['speed_kmh', 'incline_pct'] as const).some(key => (age(key) ?? 0) > staleAfter)
  return <>
    <Group header="Tapis" className="mt-9">
      <Row title={s?.device_name ?? 'RUN500'} onClick={() => setOpen(true)}
        leading={<Tile color="var(--color-blue)"><Bluetooth size={20} /></Tile>}
        trailing={<span role="status">{status}</span>} />
    </Group>
    <Sheet open={open} onClose={() => setOpen(false)} title={s?.mode === 'simulation' ? 'Tapis · Simulation' : 'Tapis'}
      trailing={<button type="button" onClick={() => setOpen(false)} className="pressable -mr-2 min-h-11 min-w-11 px-2 text-headline text-accent">OK</button>}>
      <div className="flex flex-col items-center pt-2 pb-5 text-center">
        <span className="grid size-16 place-items-center rounded-[18px] bg-blue/18 text-blue">
          {busy ? <BluetoothSearching size={30} className="animate-pulse-dot" /> : <Bluetooth size={30} />}
        </span>
        <h3 className="mt-3 text-title3">{s?.device_name ?? 'RUN500'}</h3>
        <p role="status" className="mt-1 text-subhead">{status}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-fill-3 px-3 py-1 text-footnote text-label-2"><Lock size={12} strokeWidth={2.6} />{s?.control_active ? 'Séance en cours · pilotage dans Direct' : 'Observation · démarrage depuis une séance'}</p>
      </div>
      {device.error && <p role="alert" className="mb-3 rounded-[12px] bg-red/15 px-4 py-2.5 text-subhead text-red">{device.error}</p>}
      {!s && <div role="status" className="h-[52px] animate-pulse rounded-[14px] bg-fill-3"><span className="sr-only">Chargement de l’état du tapis</span></div>}
      {s && !connected && s.phase !== 'disconnecting' && <>
        {s.devices.length > 0 && <Group className="mb-4" header="Appareils trouvés">
          {s.devices.map(row => <Row key={row.address} title={row.name} leading={<Tile color="var(--color-blue)"><Bluetooth size={18} /></Tile>} chevron={false}
            trailing={<Button size="sm" variant="gray" className="text-accent" disabled={disabled} onClick={() => void device.act('connect', row.address)}>
              {s.phase === 'connecting' || device.pending === 'connect' ? 'Connexion…' : 'Connecter'}
            </Button>} />)}
        </Group>}
        <Button className="w-full" variant={s.devices.length ? 'gray' : 'primary'} disabled={disabled} onClick={() => { setSearched(true); void device.act('scan') }}>
          {s.phase === 'scanning' || device.pending === 'scan' ? 'Recherche en cours…' : s.devices.length ? 'Rechercher à nouveau' : 'Rechercher un tapis'}
        </Button>
        {s.devices.length === 0 && !busy && <p role="status" className="mt-3 px-4 text-center text-footnote text-label-2">
          {s.mode === 'simulation' ? 'La recherche trouve le simulateur.'
            : searched ? 'Aucun tapis trouvé. Allumez le RUN500 et vérifiez le Bluetooth du PC, à proximité.' : 'Allumez le RUN500 à proximité du PC.'}
        </p>}
      </>}
      {(connected || s?.phase === 'disconnecting') && <>
        <h3 className="mb-1.5 px-4 text-footnote text-label-2 uppercase">Mesures en direct</h3>
        <StatGrid compact stats={metricInfo.map(m => ({ ...m, value: value(m.key) }))} />
        {missing && <p role="status" className="mt-2 px-4 text-footnote text-orange">
          {stale ? 'Mesures anciennes : en attente de nouvelles données.' : 'Vitesse ou pente non reçue.'}
        </p>}
        <Disclosure title="Fraîcheur des mesures" className="mt-3">
          <Facts rows={metricInfo.map(m => {
            const seconds = age(m.key)
            const text = s?.measurements[m.key].quality === 'absent' ? 'Indisponible' : seconds === null ? 'Non reçue'
              : `${seconds > staleAfter ? 'Ancienne · ' : ''}il y a ${number(seconds, 0)} s`
            return [m.label, <span className={seconds !== null && seconds > staleAfter ? 'text-orange' : undefined}>{text}</span>] as const
          })} />
        </Disclosure>
        <Group header="Capacités lues" className="mt-6">
          <Row title="Vitesse" trailing={<span className="num">{range(s?.capabilities.speed_range, 'km/h')}</span>} />
          {s?.capabilities.speed_range && <Row title="Pas de vitesse" trailing={<span className="num">{number(s.capabilities.speed_range.step, 2)} km/h</span>} />}
          <Row title="Pente" trailing={<span className="num">{range(s?.capabilities.incline_range, '%')}</span>} />
          {s?.capabilities.incline_range && <Row title="Pas de pente" trailing={<span className="num">{number(s.capabilities.incline_range.step, 2)} %</span>} />}
          <Row title="Mesures du tapis" trailing={s?.capabilities.treadmill_data ? 'Disponibles' : 'Absentes'} />
          <Row title="Cardio annoncé" trailing={s?.capabilities.heart_rate_data === undefined ? 'Non lu' : s.capabilities.heart_rate_data ? 'Oui' : 'Non'} />
        </Group>
        {!!s?.capability_errors.length && <p role="alert" className="mt-2 px-4 text-footnote text-orange">Certaines capacités n’ont pas pu être lues. Déconnectez puis reconnectez pour réessayer.</p>}
        <Group className="mt-6">
          <button type="button" disabled={disabled || s?.control_active} onClick={() => void device.act('disconnect')}
            className="g-row flex min-h-11 w-full items-center justify-center px-4 text-body text-accent active:bg-fill-4 desk:hover:bg-fill-4 disabled:text-label-3">
            {s?.phase === 'disconnecting' || device.pending === 'disconnect' ? 'Déconnexion en cours…' : 'Déconnecter'}
          </button>
        </Group>
      </>}
    </Sheet>
  </>
}
