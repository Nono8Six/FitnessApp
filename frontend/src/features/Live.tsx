import { ChevronDown, OctagonAlert, Pause, Play, Square, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ProgrammeChart, Ring, TimeChart } from '../components/charts'
import { Button, cx, Group, Row, Segmented, Sheet, Switch } from '../components/ui'
import { PROFILES } from '../data/demo'
import { clock, dec1, dec2, pace } from '../lib/format'
import { blockAt, isActive, live, useLive, type LiveState } from '../lib/live'
import { href, navigate, scenario } from '../lib/router'

type Window = '60' | '300' | 'all'

function Countdown({ n }: { n: number }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black">
      <div className="flex flex-col items-center gap-8">
        <Ring value={n / 3} size={220} stroke={16}>
          <span key={n} className="num animate-pop text-[112px] leading-none font-bold">{n}</span>
        </Ring>
        <Button variant="gray" size="md" onClick={() => { live.reset(); navigate(href.today) }}>Annuler</Button>
      </div>
    </div>
  )
}

function Banner({ tone, icon, children }: { tone: 'yellow' | 'orange' | 'red'; icon?: ReactNode; children: ReactNode }) {
  const c = { yellow: 'bg-yellow/15 text-yellow', orange: 'bg-orange/15 text-orange', red: 'bg-red/15 text-red' }[tone]
  return (
    <div role="status" className={cx('flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-subhead font-medium', c)}>
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function StatusBanner({ s }: { s: LiveState }) {
  if (s.link === 'lost')
    return <Banner tone="red" icon={<OctagonAlert size={18} />}>Tapis déconnecté. État de la bande inconnu : utilisez le STOP physique.</Banner>
  if (s.link === 'unknown')
    return <Banner tone="red" icon={<OctagonAlert size={18} />}>Résultat de la dernière commande inconnu. Utilisez le STOP physique, puis reconnectez.</Banner>
  if (s.link === 'stale')
    return <Banner tone="orange" icon={<TriangleAlert size={18} />}>Aucune mesure depuis {s.staleFor} s.</Banner>
  if (s.status === 'paused')
    return <Banner tone="yellow" icon={<Pause size={18} fill="currentColor" strokeWidth={0} />}>En pause · <span className="num">{clock(s.pausedSec)}</span></Banner>
  if (s.status === 'stopping')
    return <Banner tone="orange">Arrêt demandé · <span className="num">{dec1(s.speed ?? 0)}</span> km/h mesurés</Banner>
  return null
}

function Hero({ s, unitPace, onToggle }: { s: LiveState; unitPace: boolean; onToggle: () => void }) {
  const block = blockAt(s.blocks, s.t)
  const known = s.link === 'ok' && s.speed !== null
  const value = !known ? '--' : unitPace ? pace(s.speed!) : dec1(s.speed!)
  const target = unitPace ? pace(block.speed) : dec1(block.speed)
  const lastKnown = s.samples.at(-1)?.speed
  return (
    <div>
      <div className="num text-[40px] leading-[44px] font-semibold tracking-[-0.02em] text-time desk:text-[56px] desk:leading-[60px]" aria-label={`Durée active ${clock(s.t)}`}>
        {clock(s.t)}
      </div>
      <button onClick={onToggle} className="mt-1 flex items-baseline text-left whitespace-nowrap" aria-label={`${unitPace ? 'Allure' : 'Vitesse'} ${value}. Changer d’unité`}>
        <span className={cx('num text-[104px] leading-[108px] font-bold tracking-[-0.045em] desk:text-[168px] desk:leading-[170px]', !known && 'tracking-[0.04em] text-label-3')}>{value}</span>
        <span className="num ml-2 text-[22px] font-bold text-label-2 uppercase desk:text-[30px]">{unitPace ? '/km' : 'km/h'}</span>
      </button>
      <div className="mt-2 text-subhead text-label-2">
        {known || s.link === 'ok' ? (
          <>Cible <span className="num font-semibold text-label">{target}</span> {unitPace ? '/km' : 'km/h'}</>
        ) : (
          <span className="text-orange">Dernière mesure <span className="num font-semibold">{lastKnown != null ? dec1(lastKnown) : '—'}</span> km/h, il y a {s.staleFor} s</span>
        )}
      </div>
    </div>
  )
}

function Secondary({ s, unitPace }: { s: LiveState; unitPace: boolean }) {
  const known = s.link === 'ok'
  const items: [string, string, string, string?][] = [
    ['Distance', known ? dec2(s.km) : '--', 'km'],
    ['Pente', known && s.incline !== null ? dec1(s.incline) : '--', '%', known ? 'var(--color-incline)' : 'var(--color-label-3)'],
    [unitPace ? 'Vitesse' : 'Allure', known && s.speed ? (unitPace ? dec1(s.speed) : pace(s.speed)) : '--', unitPace ? 'km/h' : '/km'],
  ]
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map(([k, v, u, c]) => (
        <div key={k}>
          <dt className="text-footnote text-label-2">{k}</dt>
          <dd className={cx('num text-[30px] leading-9 font-semibold tracking-[-0.02em] whitespace-nowrap desk:text-[36px] desk:leading-[42px]', v === '--' && 'text-label-3')} style={{ color: v === '--' ? undefined : c }}>
            {v}<span className="ml-1 text-[14px] font-bold text-label-2 uppercase">{u}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function BlockCard({ s }: { s: LiveState }) {
  const b = blockAt(s.blocks, s.t)
  const next = s.blocks[b.index + 1]
  const remaining = b.end - s.t
  const p = (s.t - b.start) / b.sec
  return (
    <section className="rounded-[22px] bg-surface p-5" aria-label="Bloc en cours">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-footnote text-label-2"><span className="num">Bloc {b.index + 1}/{s.blocks.length}</span></div>
          <div className="mt-0.5 text-title3">{b.label}</div>
          <div className="num mt-0.5 text-subhead text-label-2">{dec1(b.speed)} km/h · {dec1(b.incline)} %</div>
        </div>
        <div className="text-right">
          <div className="num text-[34px] leading-10 font-semibold tracking-[-0.02em]">{clock(remaining)}</div>
          <div className="text-footnote text-label-2">restant</div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-fill-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${p * 100}%` }} />
      </div>
      {next && (
        <div className="num mt-3 flex items-center justify-between text-subhead">
          <span className="text-label-2">Ensuite</span>
          <span><span className="font-semibold">{next.label}</span><span className="text-label-2"> · {dec1(next.speed)} km/h · {clock(next.sec)}</span></span>
        </div>
      )}
      <ProgrammeChart blocks={s.blocks} progress={s.t} height={34} className="mt-4" />
      <div className="num mt-2 flex justify-between text-footnote text-label-2">
        <span>{clock(s.t)}</span>
        <span>−{clock(s.blocks.at(-1)!.end - s.t)}</span>
      </div>
    </section>
  )
}

function LiveChart({ s }: { s: LiveState }) {
  const [win, setWin] = useState<Window>('300')
  const total = s.blocks.at(-1)!.end
  const x1 = win === 'all' ? total : Math.max(Number(win), s.t)
  const x0 = win === 'all' ? 0 : x1 - Number(win)
  const maxT = Math.max(...s.blocks.map((b) => b.speed))
  return (
    <section className="rounded-[22px] bg-surface p-5" aria-label="Vitesse et cible">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-footnote text-label-2">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-accent" />Mesurée</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-white/60" />Cible</span>
        </div>
        <Segmented label="Fenêtre" value={win} onChange={setWin} className="w-[176px]"
          options={[{ value: '60', label: '1 min' }, { value: '300', label: '5 min' }, { value: 'all', label: 'Séance' }]} />
      </div>
      <TimeChart
        label="Vitesse mesurée et cible"
        unit="km/h"
        height={170}
        x0={x0} x1={x1} y0={Math.max(0, Math.floor(Math.min(...s.blocks.map((b) => b.speed)) - 2))} y1={Math.ceil(maxT + 1)}
        live={s.status === 'running'}
        series={[
          { key: 'speed', data: s.samples, value: (p) => p.speed, color: 'var(--color-accent)', width: 2.5, area: true },
          { key: 'target', data: s.samples, value: (p) => p.target, color: 'rgb(255 255 255 / .6)', width: 1.5, dash: '4 4', step: true },
        ]}
        markers={s.events.filter((e) => e.kind === 'pause').map((e) => ({ t: e.t, label: 'Pause' }))}
      />
      <div className="mt-4 mb-1 flex items-center gap-1.5 text-footnote text-label-2">
        <span className="h-0.5 w-3.5 rounded-full bg-incline" />Pente
      </div>
      <TimeChart
        label="Pente mesurée"
        unit="%"
        height={64}
        x0={x0} x1={x1} y0={0} y1={Math.max(1, Math.ceil(Math.max(...s.blocks.map((b) => b.incline))))}
        series={[{ key: 'incline', data: s.samples, value: (p) => p.incline, color: 'var(--color-incline)', width: 2, step: true }]}
      />
    </section>
  )
}

function ResumeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [belt, setBelt] = useState(false)
  const close = () => { setBelt(false); onClose() }
  return (
    <Sheet open={open} onClose={close} title="Reprendre"
      leading={<button onClick={close} className="pressable text-body text-accent">Annuler</button>}>
      <Group className="mt-2">
        <Row title="Bande libre" trailing={<Switch checked={belt} onChange={setBelt} label="Bande libre" />} />
      </Group>
      <Button className="mt-6 w-full" disabled={!belt} onClick={() => { live.resume(); close() }}>
        <Play size={18} fill="currentColor" strokeWidth={0} />Reprendre
      </Button>
    </Sheet>
  )
}

function RoundButton({ label, color, onClick, disabled, children }: { label: string; color: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="pressable flex flex-col items-center gap-1.5 disabled:opacity-35" aria-label={label}>
      <span className="grid size-[68px] place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}>
        {children}
      </span>
      <span className="text-footnote font-semibold" style={{ color }}>{label}</span>
    </button>
  )
}

function Controls({ s }: { s: LiveState }) {
  const [resume, setResume] = useState(false)
  const channel = s.link === 'ok' || s.link === 'stale'
  const paused = s.status === 'paused'
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-black pt-3 pb-safe before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-black before:to-black/0 desk:static desk:mt-12 desk:bg-transparent desk:p-0 desk:before:hidden">
      <div className="mx-auto flex max-w-[420px] items-start justify-center gap-16 pb-4 desk:mx-0 desk:justify-start desk:gap-10">
        {paused ? (
          <RoundButton label="Reprendre" color="var(--color-green)" onClick={() => setResume(true)} disabled={!channel}>
            <Play size={28} fill="currentColor" strokeWidth={0} />
          </RoundButton>
        ) : (
          <RoundButton label="Pause" color="var(--color-yellow)" onClick={() => live.pause()} disabled={!channel || s.status !== 'running'}>
            <Pause size={28} fill="currentColor" strokeWidth={0} />
          </RoundButton>
        )}
        <RoundButton label="Arrêter" color="var(--color-red)" onClick={() => live.stop()} disabled={!channel || (s.status !== 'running' && !paused)}>
          <Square size={24} fill="currentColor" strokeWidth={0} />
        </RoundButton>
      </div>
      <ResumeSheet open={resume} onClose={() => setResume(false)} />
    </div>
  )
}

function Finished({ s }: { s: LiveState }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black">
      <div className="animate-enter mx-auto flex min-h-full max-w-[480px] flex-col px-5 pt-[calc(env(safe-area-inset-top)+48px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="text-footnote font-semibold text-green">Arrêt confirmé · 0,0 km/h</div>
        <h1 className="mt-1 text-largetitle">{s.programme.name}</h1>
        <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
          {[
            ['Durée active', clock(s.t), '', 'var(--color-time)'],
            ['Distance', dec2(s.km), 'km'],
            ['Vitesse moy.', s.t ? dec1((s.km / s.t) * 3600) : '—', 'km/h'],
            ['Pauses', String(s.events.filter((e) => e.kind === 'pause').length), ''],
          ].map(([k, v, u, c]) => (
            <div key={k}>
              <dt className="text-footnote text-label-2">{k}</dt>
              <dd className="num text-[34px] leading-10 font-semibold tracking-[-0.02em]" style={{ color: c || undefined }}>
                {v}{u && <span className="ml-1 text-[15px] font-bold text-label-2 uppercase">{u}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto grid gap-3 pt-10">
          <Button onClick={() => { live.reset(); navigate(href.session('a10')) }}>Voir le bilan</Button>
          <Button variant="gray" onClick={() => { live.reset(); navigate(href.today) }}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

function Idle() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-title3">Aucune séance en cours</p>
        <Button className="mt-6" onClick={() => navigate(href.today)}>Préparer une séance</Button>
      </div>
    </div>
  )
}

export function Live() {
  const s = useLive()
  const [unitPace, setUnitPace] = useState(false)

  useEffect(() => {
    const sc = scenario()
    if (s.status === 'idle' && sc && ['live', 'paused', 'stale', 'lost', 'unknown'].includes(sc)) live.seed(sc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (s.status === 'countdown') return <Countdown n={s.countdown} />
  if (s.status === 'stopped') return <Finished s={s} />
  if (!isActive(s.status)) return <Idle />

  return (
    <div className="min-h-dvh bg-black pb-[calc(140px+env(safe-area-inset-bottom))] desk:pb-12">
      <header className="sticky top-0 z-30 bg-black/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto grid h-12 max-w-[1240px] grid-cols-[1fr_auto_1fr] items-center px-3 desk:px-10">
          <a href={href.today} className="pressable grid size-10 place-items-center justify-self-start rounded-full bg-fill-3" aria-label="Réduire">
            <ChevronDown size={22} strokeWidth={2.4} />
          </a>
          <div className="text-center leading-tight">
            <div className="text-headline">{s.programme.name}</div>
            <div className="text-caption text-label-2">{PROFILES[s.profile].name}</div>
          </div>
          <div className={cx('flex items-center gap-1.5 justify-self-end rounded-full px-3 py-1.5 text-footnote font-semibold',
            s.link === 'ok' ? 'text-label-2' : s.link === 'stale' ? 'bg-orange/15 text-orange' : 'bg-red/15 text-red')}>
            <span className={cx('size-2 rounded-full', s.link === 'ok' ? 'bg-green' : s.link === 'stale' ? 'bg-orange' : 'bg-red')} />
            RUN500
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-5 desk:grid desk:grid-cols-[minmax(0,1fr)_minmax(0,560px)] desk:gap-12 desk:px-10 desk:pt-6">
        <div className="pt-2">
          <div className="mb-4 empty:hidden"><StatusBanner s={s} /></div>
          <Hero s={s} unitPace={unitPace} onToggle={() => setUnitPace((v) => !v)} />
          <div className="mt-7 border-t-[0.5px] border-sep pt-5">
            <Secondary s={s} unitPace={unitPace} />
          </div>
          <Controls s={s} />
        </div>
        <div className="mt-7 grid gap-4 desk:mt-2">
          <BlockCard s={s} />
          <LiveChart s={s} />
        </div>
      </div>
    </div>
  )
}
