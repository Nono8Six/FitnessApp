import { useMemo, useState } from 'react'
import { nearest, TimeChart } from '../components/charts'
import { Page } from '../components/Shell'
import { Button, cx, Group, Row, SectionHeader } from '../components/ui'
import { buildSamples, COMPARE_SAMPLES, expand, GAP, HISTORY, longDate, PAUSE, programmeById, SESSION_SAMPLES, shortDate, type Sample, type Session } from '../data/demo'
import { clock, dec1, dec2, pace } from '../lib/format'
import { href } from '../lib/router'

function findSession(id: string): Session {
  return HISTORY.arnaud.find((s) => s.id === id) ?? HISTORY.ophelie.find((s) => s.id === id) ?? HISTORY.arnaud[1]
}

function samplesFor(s: Session): Sample[] {
  if (s.id === 'a10') return SESSION_SAMPLES
  const blocks = expand(programmeById(s.programmeId).items)
  return buildSamples(blocks, undefined, Number(s.id.slice(1)) + 11)
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

function Stat({ k, v, u, color }: { k: string; v: string; u?: string; color?: string }) {
  return (
    <div>
      <dt className="text-footnote text-label-2">{k}</dt>
      <dd className="num text-[28px] leading-[34px] font-semibold tracking-[-0.02em]" style={{ color }}>
        {v}{u && <span className="ml-1 text-[13px] font-bold text-label-2 uppercase">{u}</span>}
      </dd>
    </div>
  )
}

function Rpe({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const labels = ['', 'Très facile', 'Facile', 'Facile', 'Modéré', 'Modéré', 'Soutenu', 'Difficile', 'Très difficile', 'Très difficile', 'Maximal']
  return (
    <section aria-labelledby="rpe-title">
      <SectionHeader title="Ressenti" />
      <div className="rounded-[12px] bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span id="rpe-title" className="text-subhead text-label-2">Effort perçu</span>
          <span className="text-subhead">
            {value ? <><span className="num font-semibold">{value}</span><span className="text-label-2">/10 · {labels[value]}</span></> : <span className="text-label-3">Non renseigné</span>}
          </span>
        </div>
        <div role="radiogroup" aria-label="Effort perçu de 1 à 10" className="mt-3 grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} role="radio" aria-checked={value === n} onClick={() => setValue(n)}
              className={cx('num h-11 rounded-[8px] text-subhead font-semibold transition-colors',
                value === n ? 'bg-accent text-on-accent' : 'bg-fill-3 text-label-2')}>
              {n}
            </button>
          ))}
        </div>
        {value !== saved && (
          <Button size="md" className="mt-4 w-full" onClick={() => setSaved(value)}>Enregistrer</Button>
        )}
      </div>
    </section>
  )
}

export function SessionDetail({ id }: { id: string }) {
  const session = findSession(id)
  const programme = programmeById(session.programmeId)
  const blocks = useMemo(() => expand(programme.items), [programme])
  const samples = useMemo(() => samplesFor(session), [session])
  const isRef = session.id === 'a10'
  const previous = HISTORY.arnaud.find((s) => s.programmeId === session.programmeId && s.date < session.date)
  const [compare, setCompare] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)

  const speeds = samples.map((s) => s.speed).filter((v): v is number => v !== null)
  const inclines = samples.map((s) => s.incline).filter((v): v is number => v !== null)
  const avg = mean(speeds)
  const total = blocks.at(-1)!.end
  const at = cursor !== null ? nearest(samples, cursor) : undefined
  const atCmp = cursor !== null && compare ? nearest(COMPARE_SAMPLES, cursor) : undefined

  const perBlock = blocks.map((b) => {
    const v = samples.filter((s) => s.t >= b.start + 15 && s.t < b.end && s.speed !== null).map((s) => s.speed!)
    return { b, avg: mean(v) }
  })

  return (
    <Page title={programme.name} overline={longDate(session.date)} back={{ label: 'Historique', href: href.history }}>
      <div className="grid gap-8 desk:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] desk:items-start">
        <div className="grid gap-8">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-[22px] bg-surface p-5 desk:grid-cols-3">
            <Stat k="Durée active" v={clock(session.activeSec)} color="var(--color-time)" />
            <Stat k="Distance" v={dec2(session.km)} u="km" />
            <Stat k="Vitesse moy." v={dec1(avg)} u="km/h" color="var(--color-accent)" />
            <Stat k="Allure moy." v={pace(avg)} u="/km" />
            <Stat k="Pente moy." v={dec1(mean(inclines))} u="%" color="var(--color-incline)" />
            <Stat k="Durée totale" v={clock(session.wallSec)} />
          </dl>

          <section aria-labelledby="speed-title">
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div className="min-h-[52px]">
                {at ? (
                  <>
                    <div className="num text-footnote text-label-2">{clock(at.t)}</div>
                    <div className="num text-[26px] leading-8 font-semibold">
                      {at.speed !== null ? dec1(at.speed) : '—'}<span className="ml-1 text-[13px] font-bold text-label-2">KM/H</span>
                      <span className="ml-3 text-subhead font-normal text-label-2">cible {dec1(at.target)}{atCmp?.speed != null && ` · ${shortDate(previous!.date)} ${dec1(atCmp.speed)}`}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 id="speed-title" className="text-title3">Vitesse</h2>
                    <div className="num text-subhead text-label-2">Moy. {dec1(avg)} km/h · max {dec1(Math.max(...speeds))}</div>
                  </>
                )}
              </div>
              {previous && (
                <button onClick={() => setCompare((v) => !v)} aria-pressed={compare}
                  className={cx('pressable h-8 shrink-0 rounded-full px-3.5 text-footnote font-semibold', compare ? 'bg-label text-black' : 'bg-fill-3 text-label')}>
                  {shortDate(previous.date)}
                </button>
              )}
            </div>
            <div className="rounded-[22px] bg-surface px-4 pt-4 pb-2">
              <TimeChart
                label="Vitesse mesurée et cible sur la séance"
                unit="km/h"
                height={210}
                x0={0} x1={total} y0={4} y1={10}
                cursor={cursor} onCursor={setCursor}
                gaps={isRef ? [GAP] : []}
                markers={isRef ? [{ t: PAUSE.at, label: 'Pause' }] : []}
                series={[
                  { key: 'speed', data: samples, value: (p) => p.speed, color: 'var(--color-accent)', width: 2, area: !compare },
                  ...(compare ? [{ key: 'cmp', data: COMPARE_SAMPLES, value: (p: Sample) => p.speed, color: '#64d2ff', width: 1.5 }] : []),
                  { key: 'target', data: samples, value: (p) => p.target, color: 'rgb(255 255 255 / .55)', width: 1.5, dash: '4 4', step: true },
                ]}
              />
              <div className="mt-1 mb-2 flex items-center gap-1.5 px-0.5 text-footnote text-label-2">
                <span className="h-0.5 w-3.5 rounded-full bg-incline" />Pente
                {at && <span className="num ml-auto text-label">{at.incline !== null ? `${dec1(at.incline)} %` : '—'}</span>}
              </div>
              <TimeChart
                label="Pente sur la séance"
                unit="%"
                height={70}
                x0={0} x1={total} y0={0} y1={Math.max(1, Math.ceil(Math.max(...inclines)))}
                cursor={cursor} onCursor={setCursor}
                gaps={isRef ? [GAP] : []}
                series={[{ key: 'incline', data: samples, value: (p) => p.incline, color: 'var(--color-incline)', width: 2, step: true }]}
              />
            </div>
          </section>

          <section aria-labelledby="blocks-title">
            <SectionHeader title="Blocs" />
            <Group>
              <div className="grid grid-cols-[1fr_64px_64px_56px] gap-2 px-4 pt-3 pb-1.5 text-caption text-label-2">
                <span>Bloc</span><span className="text-right">Cible</span><span className="text-right">Mesurée</span><span className="text-right">Durée</span>
              </div>
              {perBlock.map(({ b, avg: a }) => {
                const delta = a - b.speed
                return (
                  <div key={b.index} className="num grid grid-cols-[1fr_64px_64px_56px] items-center gap-2 px-4 py-2.5 text-subhead shadow-[inset_0_0.5px_0_var(--color-sep)]">
                    <span className="truncate">{b.label}</span>
                    <span className="text-right text-label-2">{dec1(b.speed)}</span>
                    <span className={cx('text-right font-semibold', Math.abs(delta) > 0.3 && 'text-orange')}>{dec1(a)}</span>
                    <span className="text-right text-label-2">{clock(b.sec)}</span>
                  </div>
                )
              })}
            </Group>
            <p className="mt-2 px-4 text-footnote text-label-2">En km/h. Mesurée : moyenne hors 15 s de transition.</p>
          </section>
        </div>

        <div className="grid gap-8">
          <Rpe initial={session.rpe} />

          <section aria-labelledby="events-title">
            <SectionHeader title="Événements" />
            <Group>
              {isRef ? (
                <>
                  <Row leading={<span className="num w-11 text-subhead text-label-2">{clock(GAP[0])}</span>} title="Mesures interrompues" subtitle="20 s, non interpolées" />
                  <Row leading={<span className="num w-11 text-subhead text-label-2">{clock(PAUSE.at)}</span>} title="Pause" subtitle={<span className="num">{clock(PAUSE.sec)}, reprise confirmée</span>} />
                  <Row leading={<span className="num w-11 text-subhead text-label-2">{clock(total)}</span>} title="Arrêt confirmé" subtitle="Fin du programme" />
                </>
              ) : (
                <Row leading={<span className="num w-11 text-subhead text-label-2">{clock(total)}</span>} title="Arrêt confirmé" subtitle="Fin du programme" />
              )}
            </Group>
          </section>

          <section aria-labelledby="data-title">
            <SectionHeader title="Données" />
            <Group>
              <Row title="Couverture" trailing={<span className="num">{dec1(session.coverage)} %</span>} />
              <Row title="Source" trailing="RUN500 · FTMS" />
              <Row title="Cardio" trailing={<span className="text-label-3">Non disponible</span>} />
            </Group>
          </section>

          <Button variant="gray" onClick={() => (location.hash = href.coach)}>Analyser avec le coach</Button>
        </div>
      </div>
    </Page>
  )
}
