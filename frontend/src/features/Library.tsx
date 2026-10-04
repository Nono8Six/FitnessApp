import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { ProgrammeChart } from '../components/charts'
import { Page } from '../components/Shell'
import { expand, PROGRAMMES, summary } from '../data/demo'
import { clock, dec1 } from '../lib/format'
import { href } from '../lib/router'

export function Library() {
  const [q, setQ] = useState('')
  const list = PROGRAMMES.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Page
      title="Séances"
      trailing={
        <a href={href.newProgramme} aria-label="Nouvelle séance" className="pressable grid size-[30px] place-items-center rounded-full bg-fill-3 text-accent">
          <Plus size={20} strokeWidth={2.6} />
        </a>
      }
    >
      <label className="mb-5 flex h-9 items-center gap-1.5 rounded-[10px] bg-fill-3 px-2 text-label-2 desk:max-w-[360px]">
        <Search size={17} strokeWidth={2.4} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une séance"
          className="min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2" />
      </label>
      <div className="grid gap-3 desk:grid-cols-2 desk:gap-4">
        {list.map((p) => {
          const blocks = expand(p.items)
          const s = summary(blocks)
          return (
            <a key={p.id} href={href.programme(p.id)} className="pressable block rounded-[22px] bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-headline">{p.name}</h2>
                <span className="num shrink-0 text-subhead text-label-2">{clock(s.sec)}</span>
              </div>
              <div className="num mt-0.5 text-footnote text-label-2">
                {dec1(s.km)} km · {dec1(s.minSpeed)}–{dec1(s.maxSpeed)} km/h · {s.count} blocs
              </div>
              <ProgrammeChart blocks={blocks} height={44} className="mt-4" />
            </a>
          )
        })}
        {!list.length && <p className="py-10 text-center text-subhead text-label-2">Aucun résultat pour « {q} ».</p>}
      </div>
    </Page>
  )
}
