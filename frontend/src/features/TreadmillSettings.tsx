import { Bluetooth, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button, Group, Row, Sheet, StatGrid, Tile } from '../components/ui'
import { useDevice, type DeviceRange, type MeasurementKey } from '../lib/device'

const phases = {
  disconnected: 'Non connecté', scanning: 'Recherche…', connecting: 'Connexion…', connected: 'Connecté', disconnecting: 'Déconnexion…',
}
const number = (value: number, digits = 1) => value.toLocaleString('fr-FR', { maximumFractionDigits: digits })
const range = (value?: DeviceRange, unit = '') => value ? `${number(value.min)}–${number(value.max)} ${unit} · pas ${number(value.step)}` : 'Non lue'
const metricInfo = [
  { key: 'speed_kmh', label: 'Vitesse', unit: 'km/h', color: 'var(--color-speed)' },
  { key: 'incline_pct', label: 'Pente', unit: '%', color: 'var(--color-incline)' },
  { key: 'distance_m', label: 'Distance', unit: 'km', color: 'var(--color-distance)' },
  { key: 'elapsed_s', label: 'Temps tapis', color: 'var(--color-time)' },
  { key: 'heart_rate_bpm', label: 'Cardio', unit: 'bpm', color: 'var(--color-heart)' },
  { key: 'energy_kcal', label: 'Calories tapis', unit: 'kcal', color: 'var(--color-energy)' },
] as const

export function TreadmillSettings({ readOnly }: { readOnly: boolean }) {
  const device = useDevice()
  const [open, setOpen] = useState(false)
  const [searched, setSearched] = useState(false)
  const s = device.data?.state
  const connected = s?.phase === 'connected'
  const busy = !!device.pending || (!!s && !['connected', 'disconnected'].includes(s.phase))
  const disabled = readOnly || device.status !== 'live' || busy
  const title = device.status === 'offline' ? 'État indisponible' : s ? phases[s.phase] : 'Chargement…'
  const age = (key: MeasurementKey) => {
    const value = s?.measurements[key].age_s
    return value === undefined || value === null ? null : value + Math.max(0, (device.now - (device.data?.receivedAt ?? device.now)) / 1000)
  }
  const value = (key: MeasurementKey) => {
    const m = s?.measurements[key]
    const seconds = age(key)
    if (!connected || device.status !== 'live' || m?.quality !== 'fresh' || seconds === null || seconds > (s?.stale_after_s ?? 5)
      || m.value === null || (key === 'heart_rate_bpm' && (m.value <= 0 || m.value >= 255))) return null
    if (key === 'elapsed_s') return `${Math.floor(m.value / 60)}:${String(Math.floor(m.value % 60)).padStart(2, '0')}`
    return key === 'distance_m' ? number(m.value / 1000, 3) : number(m.value)
  }
  return <>
    <Group header="Tapis" className="mt-9">
      <Row title={s?.device_name ?? 'RUN500'} onClick={() => setOpen(true)}
        leading={<Tile color="var(--color-blue)"><Bluetooth size={20} /></Tile>}
        subtitle={s?.mode === 'simulation' ? 'Simulation · lecture seule' : 'Lecture seule'}
        trailing={<span className={connected && device.status === 'live' ? 'text-green' : undefined}>{title}</span>} />
    </Group>
    <Sheet open={open} onClose={() => setOpen(false)} title={s?.mode === 'simulation' ? 'Tapis · Simulation' : 'Tapis'}
      trailing={<button type="button" onClick={() => setOpen(false)} className="pressable -mr-2 min-h-11 min-w-11 px-2 text-headline text-accent">OK</button>}>
      <Group>
        <Row title={s?.device_name ?? 'RUN500'} trailing={<span role="status" className={connected && device.status === 'live' ? 'text-green' : undefined}>{title}</span>} />
        <Row title="Lecture seule" subtitle="La connexion permet de consulter les mesures. Le tapis se commande depuis sa console." />
      </Group>
      {device.error && <p role="alert" className="mt-3 px-1 text-subhead text-red">{device.error}</p>}
      {!s && <div role="status" className="mt-4 h-12 animate-pulse rounded-[12px] bg-fill-3"><span className="sr-only">Chargement de l’état du tapis</span></div>}
      {s && !connected && <>
        <Button className="mt-4 w-full" disabled={disabled} onClick={() => { setSearched(true); void device.act('scan') }}>
          {s.phase === 'scanning' || device.pending === 'scan' ? 'Recherche en cours…' : 'Rechercher un tapis'}
        </Button>
        {s.devices.length > 0 && <Group className="mt-4" header="Appareils trouvés">
          {s.devices.map(row => <div key={row.address} className="g-row flex min-h-14 items-center gap-3 py-2 pr-3 pl-4">
            <span className="min-w-0 flex-1 text-body break-words">{row.name}</span>
            <Button size="md" variant="gray" disabled={disabled} onClick={() => void device.act('connect', row.address)}>Connecter</Button>
          </div>)}
        </Group>}
        {s.devices.length === 0 && !busy && <p role="status" className="mt-3 px-1 text-footnote text-label-2">
          {s.mode === 'simulation' ? 'Lancez la recherche pour trouver le simulateur.'
            : searched ? 'Aucun tapis trouvé. Allumez le RUN500 et vérifiez le Bluetooth du PC, à proximité.' : 'Allumez le RUN500 à proximité du PC, puis lancez la recherche.'}
        </p>}
      </>}
      {(connected || s?.phase === 'disconnecting') && <>
        <h3 className="mt-6 mb-3 px-1 text-headline">Mesures en direct</h3>
        <StatGrid compact stats={metricInfo.map(m => ({ ...m, value: value(m.key) }))} />
        {device.status === 'live' && (['speed_kmh', 'incline_pct'] as const).some(key => value(key) === null) && <p role="status" className="mt-2 px-1 text-footnote text-orange">
          {(['speed_kmh', 'incline_pct'] as const).some(key => (age(key) ?? 0) > (s?.stale_after_s ?? 5)) ? 'Mesures anciennes : en attente de nouvelles données.'
              : 'Vitesse ou pente non reçue.'}
        </p>}
        <details className="mt-2 text-footnote text-label-2">
          <summary className="pressable flex min-h-11 cursor-pointer items-center justify-between px-1">Fraîcheur des mesures<ChevronDown aria-hidden size={16} /></summary>
          <dl className="px-1 pb-2">
            {metricInfo.map(m => {
              const seconds = age(m.key)
              return <div key={m.key} className="flex justify-between gap-3 py-1"><dt>{m.label}</dt><dd>
                {s?.measurements[m.key].quality === 'absent' ? 'Indisponible' : seconds === null ? 'Non reçue' : `${seconds > (s?.stale_after_s ?? 5) ? 'Ancienne · ' : ''}il y a ${number(seconds, 0)} s`}
              </dd></div>
            })}
          </dl>
        </details>
        <Group header="Capacités lues" className="mt-5">
          <Row title="Vitesse" subtitle={range(s?.capabilities.speed_range, 'km/h')} />
          <Row title="Pente" subtitle={range(s?.capabilities.incline_range, '%')} />
          <Row title="Mesures du tapis" trailing={s?.capabilities.treadmill_data ? 'Disponibles' : 'Absentes'} />
          <Row title="Cardio annoncé" trailing={s?.capabilities.heart_rate_data === undefined ? 'Non lu' : s.capabilities.heart_rate_data ? 'Oui' : 'Non'} />
        </Group>
        {!!s?.capability_errors.length && <p role="alert" className="mt-2 px-1 text-footnote text-orange">Certaines capacités n’ont pas pu être lues. Déconnectez puis reconnectez pour réessayer.</p>}
        <Button className="mt-5 w-full" variant="gray" disabled={disabled} onClick={() => void device.act('disconnect')}>
          {s?.phase === 'disconnecting' || device.pending === 'disconnect' ? 'Déconnexion en cours…' : 'Déconnecter'}
        </Button>
      </>}
    </Sheet>
  </>
}
