import { Check, ChevronLeft, ChevronsUpDown, Plus, Radio, RefreshCw, Settings as SettingsIcon, WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { errorMessage } from '../lib/api'
import { chooseProfile, createProfile, loadProfiles, NAME_MAX, useCurrentProfile, useProfiles, type Profile } from '../lib/profiles'
import { checkServer, useServer } from '../lib/server'
import { href, navigate, type Route } from '../lib/router'
import { CoachIcon, LibraryIcon, TodayIcon } from './Icons'
import { Avatar, cx, Group, Row, Sheet, Tile } from './ui'
import { Activity, ReturnToPreparation } from '../features/Direct'
import { inProgress, useExecution } from '../lib/execution'

/** Destinations réellement construites. Chaque brique ajoute la sienne. */
const TABS = [
  { key: 'today', label: 'Aujourd’hui', href: href.today, Icon: TodayIcon, match: ['today', 'recordings', 'report'] },
  { key: 'library', label: 'Séances', href: href.library, Icon: LibraryIcon, match: ['library', 'workout', 'editor'] },
  { key: 'coach', label: 'Coach', href: href.coach, Icon: CoachIcon, match: ['coach'] },
] as const

/** iOS n’affiche pas de barre d’onglets pour une seule destination. */
const HAS_TAB_BAR = TABS.length > 1

/** Premier caractère du nom, emoji compris. */
export const initial = (p: Profile) => (Array.from(p.name)[0] ?? '').toLocaleUpperCase('fr-FR')

/* ---------- Profile switcher ---------- */

let openProfiles: (() => void) | null = null
export const showProfiles = () => openProfiles?.()
let openNewProfile: (() => void) | null = null

/** Choix du profil de cet appareil. Serveur injoignable : liste en lecture seule. */
function ProfileSheet() {
  const [open, setOpen] = useState(false)
  const server = useServer()
  const profiles = useProfiles()
  const current = useCurrentProfile()
  const list = profiles.status === 'loading' ? undefined : profiles.profiles
  const readOnly = server.status !== 'ok'
  useEffect(() => {
    openProfiles = () => setOpen(true)
    return () => void (openProfiles = null)
  }, [])
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onClose={close} title="Profil"
      trailing={<button type="button" onClick={close} className="pressable -mr-2 h-11 min-w-11 px-2 text-headline text-accent">OK</button>}>
      {list && (
        <Group>
          {list.map((p) => (
            <Row
              key={p.id}
              onClick={readOnly ? undefined : () => { chooseProfile(p.id); close() }}
              chevron={false}
              leading={<Avatar initial={initial(p)} size={32} />}
              title={p.name}
              trailing={p.id === current?.id ? <Check size={20} strokeWidth={2.6} className="text-accent" aria-label="Profil actuel" /> : null}
            />
          ))}
          <Row
            onClick={readOnly ? undefined : () => { close(); openNewProfile?.() }}
            chevron={false}
            leading={<Tile color={readOnly ? '#8e8e93' : undefined}><Plus size={20} strokeWidth={2.4} /></Tile>}
            title={<span className={readOnly ? 'text-label-3' : 'text-accent'}>Nouveau profil</span>}
          />
        </Group>
      )}
      <Group className="mt-6">
        <Row
          onClick={() => { close(); navigate(href.settings) }}
          leading={<Tile color="#8e8e93"><SettingsIcon size={19} strokeWidth={2.2} /></Tile>}
          title="Réglages"
        />
      </Group>
    </Sheet>
  )
}

/** Nom saisi, profil créé sur le serveur puis choisi sur cet appareil. */
function NewProfileSheet() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    openNewProfile = () => {
      setName('')
      setError(undefined)
      setOpen(true)
    }
    return () => void (openNewProfile = null)
  }, [])
  const close = () => setOpen(false)
  const ready = name.trim().length > 0 && !saving
  const create = async () => {
    if (!ready) return
    setSaving(true)
    setError(undefined)
    try {
      await createProfile(name.trim())
      close()
    } catch (err) {
      console.warn('Fitness : création du profil refusée', err)
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet open={open} onClose={close} title="Nouveau profil"
      leading={<button type="button" onClick={close} className="pressable -ml-2 h-11 min-w-11 px-2 text-body text-accent">Annuler</button>}
      trailing={<button type="button" onClick={create} disabled={!ready}
        className="pressable -mr-2 h-11 min-w-11 px-2 text-headline text-accent disabled:text-label-3">Créer</button>}>
      <Group>
        <div className="g-row pl-4">
          <input
            autoFocus
            aria-label="Nom"
            placeholder="Nom"
            maxLength={NAME_MAX}
            autoComplete="off"
            enterKeyHint="done"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(undefined) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
            className="h-11 w-full bg-transparent pr-4 text-body outline-none placeholder:text-label-3"
          />
        </div>
      </Group>
      {error && <p role="alert" className="mt-2 px-4 text-footnote text-red">{error}</p>}
    </Sheet>
  )
}

/** Avatar du profil courant ; rien tant que les profils ne sont pas lus. */
function ProfileButton({ size = 34 }: { size?: number }) {
  const current = useCurrentProfile()
  if (!current) return null
  return <Avatar initial={initial(current)} size={size} onClick={showProfiles} label={`Profil : ${current.name}`} />
}

/** Relit les profils quand le serveur redevient joignable (un autre appareil a pu les modifier). */
function ProfilesSync() {
  const status = useServer().status
  useEffect(() => {
    if (status === 'ok') void loadProfiles()
  }, [status])
  return null
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
  const profiles = useProfiles()
  const [slow, setSlow] = useState(false)
  const loading = server.status === 'loading' || (server.status === 'ok' && profiles.status === 'loading')
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
  const profiles = useProfiles()
  const [retrying, setRetrying] = useState(false)
  const message = server.status === 'down' ? server.message
    : server.status === 'ok' && profiles.status === 'error' ? profiles.message
    : undefined
  if (!message) return null
  const retry = async () => {
    setRetrying(true)
    await checkServer()
    if (profiles.status === 'error') await loadProfiles()
    setRetrying(false)
  }
  return (
    <div role="alert" className="animate-fade mb-6 flex items-center gap-3 rounded-[14px] bg-red/15 py-2.5 pr-2 pl-4 text-red">
      <WifiOff size={18} className="shrink-0" />
      <span className="flex-1 text-subhead font-medium">{message}</span>
      <button onClick={retry} disabled={retrying} aria-label="Réessayer"
        className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-red/15">
        <RefreshCw size={17} strokeWidth={2.4} className={cx(retrying && 'animate-spin')} />
      </button>
    </div>
  )
}

export function Page({
  title,
  subtitle,
  back,
  trailing,
  actions,
  showAvatar = true,
  children,
}: {
  title: string
  /** Fait sous le grand titre : date, version… */
  subtitle?: ReactNode
  back?: { label: string; href: string }
  /** Toujours dans la barre de navigation (Enregistrer…). */
  trailing?: ReactNode
  /** À côté du grand titre, puis dans la barre repliée au défilement. */
  actions?: ReactNode
  showAvatar?: boolean
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
        <div className={cx('mx-auto grid h-11 grid-cols-3 items-center gap-2 px-4 desk:px-10', width)}>
          <div className="min-w-0">
            {back && (
              <a href={back.href} className="pressable -ml-2 flex h-11 max-w-full items-center pr-2 text-body text-accent">
                <ChevronLeft size={28} strokeWidth={2.2} className="-mr-0.5 shrink-0" />
                <span className="truncate">{back.label}</span>
              </a>
            )}
          </div>
          <div className={cx('min-w-0 truncate text-center text-headline transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')} aria-hidden>
            {title}
          </div>
          <div className="flex items-center gap-3 justify-self-end">
            {trailing}
            {scrolled && actions}
            {scrolled && showAvatar && <span className="desk:hidden"><ProfileButton size={30} /></span>}
          </div>
        </div>
      </header>
      <div className={cx('mx-auto px-4 desk:px-10 desk:pb-16', HAS_TAB_BAR ? 'pb-36' : 'pb-[calc(48px+env(safe-area-inset-bottom))]', width)}>
        <div className="flex items-start justify-between gap-4 pt-1 pb-5">
          <div className="min-w-0">
            <h1 className="text-largetitle break-words">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 empty:hidden">
              {subtitle && <div className="text-subhead text-label-2">{subtitle}</div>}
              <SimulationBadge />
              <ConnectingHint />
            </div>
          </div>
          {(actions || showAvatar) && (
            // Repliés dans la barre de navigation au défilement : une seule copie reste atteignable.
            <div inert={scrolled} className={cx('mt-1 flex shrink-0 items-center gap-3 transition-opacity duration-200', scrolled && 'opacity-0')}>
              {actions}
              {showAvatar && <span className="desk:hidden"><ProfileButton /></span>}
            </div>
          )}
        </div>
        <ServerBanner />
        {children}
      </div>
    </div>
  )
}

/* ---------- Navigation ---------- */

/** Capsule flottante translucide, comme la barre d’onglets d’iOS 26. */
function TabBar({ route }: { route: Route }) {
  if (!HAS_TAB_BAR) return null
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),14px)] desk:hidden"
      aria-label="Navigation principale">
      <div className="material pointer-events-auto flex gap-1 rounded-full p-1 shadow-[0_8px_32px_rgba(0,0,0,.55),inset_0_0_0_0.5px_rgb(255_255_255/.12)]">
        {TABS.map(({ key, label, href: to, Icon, match }) => {
          const active = (match as readonly string[]).includes(route.name)
          return (
            <a key={key} href={to} aria-current={active ? 'page' : undefined}
              className={cx('pressable flex h-[54px] min-w-[104px] flex-col items-center justify-center gap-0.5 rounded-full px-4 transition-colors duration-300',
                active ? 'bg-fill-3 text-accent' : 'text-label')}>
              <Icon size={24} active={active} />
              <span className="text-[10px] leading-3 font-semibold tracking-[0.01em]">{label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}

function SidebarProfile() {
  const current = useCurrentProfile()
  if (!current) return null
  return (
    <button type="button" onClick={showProfiles} aria-label={`Profil : ${current.name}`}
      className="mt-auto flex h-12 items-center gap-2.5 rounded-[10px] px-2 text-left hover:bg-fill-4">
      <Avatar initial={initial(current)} size={30} />
      <span className="min-w-0 flex-1 truncate text-subhead font-medium">{current.name}</span>
      <ChevronsUpDown size={16} className="text-label-3" />
    </button>
  )
}

function Sidebar({ route }: { route: Route }) {
  const execution = useExecution()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#0c0c0d] px-3 py-5 shadow-[inset_-0.5px_0_0_var(--color-sep)] desk:flex">
      <div className="mb-5 px-2.5 text-title3 font-bold">Fitness</div>
      <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
        {TABS.map(({ key, label, href: to, Icon, match }) => {
          const active = (match as readonly string[]).includes(route.name)
          return (
            <a key={key} href={to} aria-current={active ? 'page' : undefined}
              className={cx('flex h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-subhead font-medium transition-colors',
                active ? 'bg-fill-3 text-label' : 'text-label-2 hover:bg-fill-4 hover:text-label')}>
              <Icon size={19} className={active ? 'text-accent' : ''} />
              {label}
            </a>
          )
        })}
      </nav>
      {inProgress(execution.feed?.session.phase) && <>
        <a href={href.direct} className="mt-3 flex min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-subhead text-accent"><Radio size={19} />Direct</a>
        <Activity desktop />
      </>}
      <SidebarProfile />
    </aside>
  )
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const direct = route.name === 'direct'
  const e = useExecution()
  const active = inProgress(e.feed?.session.phase)
  return (
    <>
      {!direct && <Sidebar route={route} />}
      <main className={cx(!direct && 'desk:pl-[248px]', !direct && active && 'has-live-activity')}>{children}{!direct && <ReturnToPreparation />}</main>
      {!direct && <><Activity /><TabBar route={route} /></>}
      <ProfileSheet />
      <NewProfileSheet />
      <ProfilesSync />
    </>
  )
}
