import { Play } from 'lucide-react'
import { useState } from 'react'
import { ProgrammeChart, Ring, WeekBars } from '../components/charts'
import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Button, Group, Row, SectionHeader, Tile } from '../components/ui'
import { expand, HISTORY, isRepeat, KIND_LABEL, longDate, programmeById, PROFILES, relativeDay, summary, TODAY, WEEK_START, weekDays, type Programme } from '../data/demo'
import { clock, dec1, dec2 } from '../lib/format'
import { useProfile } from '../lib/profile'
import { href, navigate, scenario } from '../lib/router'
import { StartSheet } from './StartSheet'

export function structure(p: Programme) {
  return p.items
    .map((i) =>
      isRepeat(i)
        ? `${i.repeat} × (${i.steps.map((s) => `${s.sec / 60} min à ${dec1(s.speed)}`).join(' + ')})`
        : `${KIND_LABEL[i.kind]} ${i.sec / 60} min`,
    )
    .join(' · ')
}

function NextCard({ programme }: { programme: Programme }) {
  const [open, setOpen] = useState(false)
  const blocks = expand(programme.items)
  const s = summary(blocks)
  return (
    <section className="rounded-[22px] bg-surface p-5 desk:p-6" aria-labelledby="next-title">
      <div className="text-footnote font-semibold text-accent">Prochaine séance</div>
      <h2 id="next-title" className="mt-0.5 text-title1">{programme.name}</h2>

      <dl className="mt-4 grid grid-cols-4 gap-2">
        {[
          ['Durée', clock(s.sec), ''],
          ['Distance', dec1(s.km), 'km'],
          ['Vitesse', `${dec1(s.minSpeed).replace(',0', '')}–${dec1(s.maxSpeed).replace(',0', '')}`, 'km/h'],
          ['Pente', `0–${dec1(s.maxIncline).replace(',0', '')}`, '%'],
        ].map(([k, v, u]) => (
          <div key={k} className="min-w-0">
            <dt className="text-caption text-label-2">{k}</dt>
            <dd className="num mt-0.5 truncate text-[20px] leading-6 font-semibold tracking-[-0.01em]">
              {v}
              {u && <span className="ml-0.5 text-[13px] font-semibold text-label-2">{u}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <ProgrammeChart blocks={blocks} height={68} className="mt-5" />
      <p className="mt-3 text-footnote text-label-2">{structure(programme)}</p>

      <div className="mt-5 grid grid-cols-[1fr_2fr] gap-3">
        <Button variant="gray" onClick={() => navigate(href.programme(programme.id))}>Modifier</Button>
        <Button onClick={() => setOpen(true)}>
          <Play size={18} fill="currentColor" strokeWidth={0} />
          Commencer
        </Button>
      </div>
      <StartSheet programme={programme} open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

function WeekCard() {
  const profileId = useProfile()
  const profile = PROFILES[profileId]
  const empty = scenario() === 'empty'
  const history = empty ? [] : HISTORY[profileId]
  const week = history.filter((s) => s.date >= WEEK_START && s.date <= TODAY)
  const days = weekDays(history)
  const min = week.reduce((n, s) => n + s.activeSec / 60, 0)
  const km = week.reduce((n, s) => n + s.km, 0)
  return (
    <section className="rounded-[22px] bg-surface p-5" aria-labelledby="week-title">
      <h2 id="week-title" className="text-headline">Cette semaine</h2>
      <div className="mt-4 flex items-center gap-5">
        <Ring value={week.length / profile.goal} size={76} stroke={11}>
          <span className="num text-[17px] font-bold">{week.length}<span className="text-label-2">/{profile.goal}</span></span>
        </Ring>
        <dl className="grid flex-1 gap-3">
          <div>
            <dt className="text-caption text-label-2">Temps actif</dt>
            <dd className="num text-[22px] leading-7 font-semibold">{min}<span className="ml-0.5 text-[13px] text-label-2">min</span></dd>
          </div>
          <div>
            <dt className="text-caption text-label-2">Distance</dt>
            <dd className="num text-[22px] leading-7 font-semibold">{dec1(km)}<span className="ml-0.5 text-[13px] text-label-2">km</span></dd>
          </div>
        </dl>
      </div>
      <div className="mt-5">
        <WeekBars days={days} />
      </div>
    </section>
  )
}

export function SessionRow({ id }: { id: string }) {
  const profileId = useProfile()
  const s = HISTORY[profileId].find((x) => x.id === id) ?? HISTORY.arnaud.find((x) => x.id === id)!
  return (
    <Row
      href={href.session(s.id)}
      leading={<Tile><RunIcon size={20} /></Tile>}
      title={programmeById(s.programmeId).name}
      subtitle={<span className="num">{clock(s.activeSec)} · {dec2(s.km)} km</span>}
      trailing={<span className="text-subhead">{relativeDay(s.date)}</span>}
    />
  )
}

export function Today() {
  const profileId = useProfile()
  const empty = scenario() === 'empty'
  const history = empty ? [] : HISTORY[profileId]
  const next = profileId === 'arnaud' ? programmeById('rythme') : programmeById('cote')
  return (
    <Page title="Aujourd’hui" overline={longDate(TODAY)}>
      <div className="grid gap-6 desk:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] desk:items-start">
        <NextCard programme={next} />
        <WeekCard />
      </div>
      <section className="mt-9" aria-labelledby="recent-title">
        <SectionHeader title="Récentes" action={history.length ? 'Tout afficher' : undefined} href={href.history} />
        {history.length ? (
          <Group>
            {history.slice(0, 4).map((s) => <SessionRow key={s.id} id={s.id} />)}
          </Group>
        ) : (
          <div className="rounded-[12px] bg-surface px-4 py-6 text-center text-subhead text-label-2">Aucune séance enregistrée.</div>
        )}
      </section>
    </Page>
  )
}
