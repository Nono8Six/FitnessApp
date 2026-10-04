import { Bluetooth } from 'lucide-react'
import { useState } from 'react'
import { Button, Group, Row, Sheet, Switch, Tile } from '../components/ui'
import { expand, type Programme } from '../data/demo'
import { dec1 } from '../lib/format'
import { live } from '../lib/live'
import { useProfile } from '../lib/profile'
import { href, navigate } from '../lib/router'

export function StartSheet({ programme, open, onClose }: { programme: Programme; open: boolean; onClose: () => void }) {
  const [key, setKey] = useState(false)
  const [belt, setBelt] = useState(false)
  const profile = useProfile()
  const first = expand(programme.items)[0]
  const close = () => {
    setKey(false)
    setBelt(false)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title="Avant de démarrer"
      leading={<button onClick={close} className="pressable text-body text-accent">Annuler</button>}>
      <Group className="mt-2">
        <Row
          leading={<Tile color="var(--color-blue)"><Bluetooth size={18} strokeWidth={2.2} /></Tile>}
          title="RUN500"
          trailing={<span className="flex items-center gap-1.5 text-subhead text-green"><span className="size-2 rounded-full bg-green" />Connecté</span>}
        />
        <Row title="Clé de sécurité en place" trailing={<Switch checked={key} onChange={setKey} label="Clé de sécurité en place" />} />
        <Row title="Bande libre" trailing={<Switch checked={belt} onChange={setBelt} label="Bande libre" />} />
      </Group>
      <p className="mt-2 px-4 text-footnote text-label-2">
        Démarrage à la vitesse minimale, puis {dec1(first.speed)} km/h{first.incline ? ` · ${dec1(first.incline)} %` : ''}.
      </p>
      <Button
        className="mt-6 w-full"
        disabled={!key || !belt}
        onClick={() => {
          live.start(programme, profile)
          close()
          navigate(href.live)
        }}
      >
        Démarrer
      </Button>
    </Sheet>
  )
}
