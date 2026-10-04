import { Check, ChevronLeft, ChevronsUpDown, Pause, Play } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { PROFILES, type ProfileId } from '../data/demo'
import { clock, dec1 } from '../lib/format'
import { blockAt, isActive, live, useLive } from '../lib/live'
import { setProfile, useProfile } from '../lib/profile'
import { href, type Route } from '../lib/router'
import { CoachIcon, HistoryIcon, LibraryIcon, LiveIcon, TodayIcon } from './Icons'
import { Avatar, cx, Group, Row, Sheet } from './ui'

const TABS = [
  { key: 'today', label: 'Aujourd’hui', href: href.today, Icon: TodayIcon, match: ['today'] },
  { key: 'library', label: 'Séances', href: href.library, Icon: LibraryIcon, match: ['library', 'editor'] },
  { key: 'live', label: 'Direct', href: href.live, Icon: LiveIcon, match: ['live'], desktopOnly: true },
  { key: 'history', label: 'Historique', href: href.history, Icon: HistoryIcon, match: ['history', 'session'] },
  { key: 'coach', label: 'Coach', href: href.coach, Icon: CoachIcon, match: ['coach'] },
] as const

/* ---------- Profile switcher ---------- */

let openProfiles: (() => void) | null = null
export const showProfiles = () => openProfiles?.()

function ProfileSheet() {
  const [open, setOpen] = useState(false)
  const current = useProfile()
  useEffect(() => {
    openProfiles = () => setOpen(true)
    return () => void (openProfiles = null)
  }, [])
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Profil"
      trailing={<button onClick={() => setOpen(false)} className="pressable text-headline text-accent">OK</button>}>
      <Group>
        {(Object.keys(PROFILES) as ProfileId[]).map((id) => (
          <Row
            key={id}
            onClick={() => { setProfile(id); setOpen(false) }}
            chevron={false}
            leading={<Avatar initial={PROFILES[id].initial} size={32} />}
            title={PROFILES[id].name}
            trailing={id === current ? <Check size={20} strokeWidth={2.6} className="text-accent" /> : null}
          />
        ))}
      </Group>
    </Sheet>
  )
}

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

export function Page({
  title,
  overline,
  back,
  trailing,
  showAvatar = true,
  children,
  wide,
}: {
  title: string
  overline?: string
  back?: { label: string; href: string }
  trailing?: ReactNode
  showAvatar?: boolean
  children: ReactNode
  wide?: boolean
}) {
  const scrolled = useScrolled(back ? 30 : 44)
  const profile = PROFILES[useProfile()]
  const avatar = showAvatar && <Avatar initial={profile.initial} onClick={showProfiles} label={`Profil : ${profile.name}`} />
  return (
    <div className="animate-enter">
      <header
        className={cx(
          'sticky top-0 z-30 pt-safe transition-[background-color,box-shadow] duration-200',
          scrolled ? 'material hairline-b' : 'bg-transparent',
        )}
      >
        <div className={cx('mx-auto grid h-11 grid-cols-[1fr_auto_1fr] items-center px-4 desk:px-10', wide ? 'max-w-[1180px]' : 'max-w-[680px] desk:max-w-[1180px]')}>
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
          <div className="flex items-center gap-4 justify-self-end">
            {trailing}
            {scrolled && <span className="desk:hidden">{avatar && <Avatar initial={profile.initial} size={30} onClick={showProfiles} label={`Profil : ${profile.name}`} />}</span>}
          </div>
        </div>
      </header>
      <div className={cx('mx-auto px-4 pb-36 desk:px-10 desk:pb-16', wide ? 'max-w-[1180px]' : 'max-w-[680px] desk:max-w-[1180px]')}>
        <div className="flex items-end justify-between gap-4 pt-1 pb-4">
          <div className="min-w-0">
            {overline && <div className="text-footnote font-semibold tracking-[0.02em] text-label-2 uppercase">{overline}</div>}
            <h1 className="text-largetitle">{title}</h1>
          </div>
          <span className="mb-1 desk:hidden">{avatar}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Live activity (mini player) ---------- */

function LiveActivity({ compact }: { compact?: boolean }) {
  const s = useLive()
  if (!isActive(s.status)) return null
  const block = blockAt(s.blocks, s.t)
  const paused = s.status === 'paused'
  return (
    <div className={cx('material flex items-center gap-3 rounded-[18px] py-2 pr-2 pl-3 shadow-[0_8px_30px_rgba(0,0,0,.5)] ring-[0.5px] ring-white/10', compact && 'rounded-[12px] shadow-none')}>
      <a href={href.live} className="flex min-w-0 flex-1 items-center gap-3" aria-label="Ouvrir la séance en direct">
        <span className={cx('size-2 shrink-0 rounded-full', paused ? 'bg-yellow' : 'animate-pulse-dot bg-accent')} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-semibold">{paused ? 'En pause' : block.label}</div>
          <div className="num text-footnote text-label-2">
            <span className="text-time">{clock(s.t)}</span> · {s.speed === null ? '—' : dec1(s.speed)} km/h
          </div>
        </div>
      </a>
      {(s.status === 'running' || paused) && (
        <button
          onClick={() => (paused ? live.resume() : live.pause())}
          aria-label={paused ? 'Reprendre' : 'Pause'}
          className="pressable grid size-10 shrink-0 place-items-center rounded-full bg-fill-3"
        >
          {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
        </button>
      )}
    </div>
  )
}

/* ---------- Navigation ---------- */

function TabBar({ route }: { route: Route }) {
  return (
    <nav className="material hairline-t fixed inset-x-0 bottom-0 z-40 pb-safe desk:hidden" aria-label="Navigation principale">
      <div className="mx-auto grid h-[50px] max-w-[680px] grid-cols-4">
        {TABS.filter((t) => !('desktopOnly' in t)).map(({ key, label, href: to, Icon, match }) => {
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
  const profile = PROFILES[useProfile()]
  const s = useLive()
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
              {key === 'live' && isActive(s.status) && <span className="ml-auto size-1.5 animate-pulse-dot rounded-full bg-accent" />}
            </a>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {route.name !== 'live' && <LiveActivity compact />}
        <button onClick={showProfiles} className="flex h-12 items-center gap-2.5 rounded-[10px] px-2 text-left hover:bg-fill-4">
          <Avatar initial={profile.initial} size={30} />
          <span className="flex-1 text-subhead font-medium">{profile.name}</span>
          <ChevronsUpDown size={16} className="text-label-3" />
        </button>
      </div>
    </aside>
  )
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const immersive = route.name === 'live'
  return (
    <>
      {!immersive && <Sidebar route={route} />}
      <main className={cx(!immersive && 'desk:pl-[248px]')}>{children}</main>
      {!immersive && (
        <>
          <div className="fixed inset-x-2 bottom-[calc(58px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[664px] desk:hidden">
            <LiveActivity />
          </div>
          <TabBar route={route} />
        </>
      )}
      <ProfileSheet />
    </>
  )
}
