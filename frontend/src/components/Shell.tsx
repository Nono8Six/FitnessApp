import { ChevronLeft, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { checkServer, useServer } from '../lib/server'
import { href, type Route } from '../lib/router'
import { TodayIcon } from './Icons'
import { cx } from './ui'

/** Destinations réellement construites. Chaque brique ajoute la sienne. */
const TABS = [
  { key: 'today', label: 'Aujourd’hui', href: href.today, Icon: TodayIcon, match: ['today'] },
] as const

/** iOS n’affiche pas de barre d’onglets pour une seule destination. */
const HAS_TAB_BAR = TABS.length > 1

/* ---------- Page header with collapsing large title ---------- */

function useScrolled(threshold: number) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

function SimulationBadge() {
  const server = useServer()
  if (server.status === 'loading' || server.health?.mode !== 'simulation') return null
  return (
    <span className="rounded-full bg-orange/15 px-2 py-px text-caption font-semibold text-orange" role="status">
      Simulation
    </span>
  )
}

/** Rien pendant une connexion rapide ; au-delà d’une seconde, un indicateur discret qui ne décale pas la page. */
function ConnectingHint() {
  const server = useServer()
  const [slow, setSlow] = useState(false)
  const loading = server.status === 'loading'
  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), 1000)
    return () => window.clearTimeout(id)
  }, [loading])
  if (!loading || !slow) return null
  return (
    <span role="status" className="animate-fade flex items-center gap-1.5 text-caption text-label-3">
      <RefreshCw size={11} strokeWidth={2.6} className="animate-spin" />
      Connexion
    </span>
  )
}

function ServerBanner() {
  const server = useServer()
  const [retrying, setRetrying] = useState(false)
  if (server.status !== 'down') return null
  const retry = async () => {
    setRetrying(true)
    await checkServer()
    setRetrying(false)
  }
  return (
    <div role="alert" className="animate-fade mb-6 flex items-center gap-3 rounded-[14px] bg-red/15 py-2.5 pr-2 pl-4 text-red">
      <WifiOff size={18} className="shrink-0" />
      <span className="flex-1 text-subhead font-medium">{server.message}</span>
      <button onClick={retry} disabled={retrying} aria-label="Réessayer"
        className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-red/15">
        <RefreshCw size={17} strokeWidth={2.4} className={cx(retrying && 'animate-spin')} />
      </button>
    </div>
  )
}

export function Page({
  title,
  overline,
  back,
  trailing,
  children,
}: {
  title: string
  overline?: string
  back?: { label: string; href: string }
  trailing?: ReactNode
  children: ReactNode
}) {
  const scrolled = useScrolled(back ? 30 : 44)
  const width = 'max-w-[680px] desk:max-w-[1180px]'
  return (
    <div className="animate-enter">
      <header
        className={cx(
          'sticky top-0 z-30 pt-safe transition-[background-color,box-shadow] duration-200',
          scrolled ? 'material hairline-b' : 'bg-transparent',
        )}
      >
        <div className={cx('mx-auto grid h-11 grid-cols-[1fr_auto_1fr] items-center px-4 desk:px-10', width)}>
          <div className="justify-self-start">
            {back && (
              <a href={back.href} className="pressable -ml-2 flex items-center text-body text-accent">
                <ChevronLeft size={28} strokeWidth={2.2} className="-mr-0.5" />
                {back.label}
              </a>
            )}
          </div>
          <div className={cx('text-headline transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')} aria-hidden>
            {title}
          </div>
          <div className="flex items-center gap-4 justify-self-end">{trailing}</div>
        </div>
      </header>
      <div className={cx('mx-auto px-4 desk:px-10 desk:pb-16', HAS_TAB_BAR ? 'pb-36' : 'pb-[calc(48px+env(safe-area-inset-bottom))]', width)}>
        <div className="pt-1 pb-4">
          <div className="flex min-h-[18px] items-center gap-2">
            {overline && <div className="text-footnote font-semibold tracking-[0.02em] text-label-2 uppercase">{overline}</div>}
            <SimulationBadge />
            <ConnectingHint />
          </div>
          <h1 className="text-largetitle">{title}</h1>
        </div>
        <ServerBanner />
        {children}
      </div>
    </div>
  )
}

/* ---------- Navigation ---------- */

function TabBar({ route }: { route: Route }) {
  if (!HAS_TAB_BAR) return null
  return (
    <nav className="material hairline-t fixed inset-x-0 bottom-0 z-40 pb-safe desk:hidden" aria-label="Navigation principale">
      <div className="mx-auto grid h-[50px] max-w-[680px]" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
        {TABS.map(({ key, label, href: to, Icon, match }) => {
          const active = (match as readonly string[]).includes(route.name)
          return (
            <a key={key} href={to} aria-current={active ? 'page' : undefined}
              className={cx('flex flex-col items-center justify-center gap-0.5 pt-1 transition-colors', active ? 'text-accent' : 'text-[#999]')}>
              <Icon size={25} active={active} />
              <span className="text-[10px] leading-3 font-medium tracking-[0.01em]">{label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}

function Sidebar({ route }: { route: Route }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#0c0c0d] px-3 py-5 shadow-[inset_-0.5px_0_0_var(--color-sep)] desk:flex">
      <div className="mb-5 px-2.5 text-title3 font-bold">Fitness</div>
      <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
        {TABS.map(({ key, label, href: to, Icon, match }) => {
          const active = (match as readonly string[]).includes(route.name)
          return (
            <a key={key} href={to} aria-current={active ? 'page' : undefined}
              className={cx('flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-subhead font-medium transition-colors',
                active ? 'bg-fill-3 text-label' : 'text-label-2 hover:bg-fill-4 hover:text-label')}>
              <Icon size={19} className={active ? 'text-accent' : ''} />
              {label}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <>
      <Sidebar route={route} />
      <main className="desk:pl-[248px]">{children}</main>
      <TabBar route={route} />
    </>
  )
}
