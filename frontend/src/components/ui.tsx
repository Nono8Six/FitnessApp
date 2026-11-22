import { Check, ChevronRight, Minus, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'gray' | 'plain' | 'danger'

export function Button({
  variant = 'primary',
  size = 'lg',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'lg' | 'md' | 'sm' }) {
  return (
    <button
      {...rest}
      className={cx(
        'pressable inline-flex items-center justify-center gap-2 font-semibold select-none',
        size === 'lg' && 'min-h-[52px] rounded-[14px] px-5 py-3 text-headline',
        size === 'md' && 'min-h-11 rounded-[12px] px-4 py-2 text-subhead',
        size === 'sm' && 'min-h-11 rounded-full px-3.5 py-1.5 text-subhead',
        variant === 'primary' && 'bg-accent text-on-accent disabled:bg-fill-3 disabled:text-label-3',
        variant === 'gray' && 'bg-fill-3 text-label disabled:text-label-3',
        variant === 'plain' && 'text-accent disabled:text-label-3',
        variant === 'danger' && 'bg-red/15 text-red disabled:opacity-35',
        className,
      )}
    />
  )
}

/* ---------- Chips (filtres en capsule) ---------- */

/** Capsule de filtre : blanche quand elle est choisie, comme les filtres d’Apple Fitness. */
export function Chip({ selected = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} {...rest}
      className={cx('pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-subhead font-medium whitespace-nowrap',
        selected ? 'bg-label text-black' : 'bg-fill-3 text-label', 'disabled:text-label-3', className)} />
  )
}

/** Rangée de capsules qui défile horizontalement sur téléphone et passe à la ligne sur PC. */
export function ChipRow({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label}
      className={cx('-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] desk:mx-0 desk:flex-wrap desk:overflow-visible desk:px-0 [&::-webkit-scrollbar]:hidden', className)}>
      {children}
    </div>
  )
}

/* ---------- Pull-down menu ---------- */

export interface MenuItem {
  label: string
  icon?: ReactNode
  /** Défini : l’élément est une option, cochée ou non. */
  checked?: boolean
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}

/**
 * Menu déroulant iOS : liste flottante translucide, coche à gauche, icône à droite.
 * Rendu en position fixe dans le body pour ne jamais être rogné par un conteneur qui défile.
 */
export function Menu({ label, button, items, className, align = 'end', disabled }: {
  label: string
  button: ReactNode
  items: (MenuItem | 'separator')[]
  className?: string
  align?: 'start' | 'end'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; height: number; origin: string }>()
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const options = items.some((i) => i !== 'separator' && i.checked !== undefined)
  const close = (focus = true) => {
    setOpen(false)
    setPos(undefined)
    if (focus) trigger.current?.focus()
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !list.current) return
    const r = trigger.current.getBoundingClientRect()
    const w = list.current.offsetWidth, h = list.current.offsetHeight
    const viewport = window.visualViewport
    const viewTop = viewport?.offsetTop ?? 0
    const viewBottom = viewTop + (viewport?.height ?? window.innerHeight)
    const aboveSpace = r.top - viewTop - 14
    const belowSpace = viewBottom - r.bottom - 14
    const below = h <= belowSpace || belowSpace >= aboveSpace
    const height = Math.min(h, Math.max(44, below ? belowSpace : aboveSpace))
    const left = Math.min(Math.max(8, align === 'end' ? r.right - w : r.left), window.innerWidth - w - 8)
    setPos({ top: below ? r.bottom + 6 : r.top - height - 6, left, height, origin: `${align === 'end' ? 'right' : 'left'} ${below ? 'top' : 'bottom'}` })
  }, [open, align])
  // Le focus attend que la liste soit placée et visible.
  useEffect(() => {
    if (!pos || !list.current) return
    const buttons = [...list.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    ;(buttons.find((b) => b.getAttribute('aria-checked') === 'true') ?? buttons[0])?.focus({ preventScroll: true })
  }, [pos])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false)
    }
    const dismiss = (e: Event) => { if (!list.current?.contains(e.target as Node)) close(false) }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    else if (e.key === 'Tab') close(false)
    else if (e.key === 'ArrowDown') buttons[(index + 1) % buttons.length]?.focus()
    else if (e.key === 'ArrowUp') buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
    else if (e.key === 'Home') buttons[0]?.focus()
    else if (e.key === 'End') buttons.at(-1)?.focus()
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }
  return (
    <>
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        disabled={disabled} onClick={() => (open ? close() : setOpen(true))} className={className}>
        {button}
      </button>
      {open && createPortal(
        <div ref={list} id={menuId} role="menu" aria-label={label} onKeyDown={onKey}
          className="fixed z-[60] max-h-[min(420px,70dvh)] w-max max-w-[min(320px,calc(100vw-16px))] min-w-[220px] overflow-y-auto rounded-[14px] bg-[#2c2c2e]/95 py-1 shadow-[0_12px_48px_rgba(0,0,0,.6),inset_0_0_0_0.5px_rgb(255_255_255/.1)] backdrop-blur-2xl backdrop-saturate-150"
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.height, transformOrigin: pos.origin, animation: 'menu-in 180ms var(--ease-ios) both' } : { top: 0, left: 0, visibility: 'hidden' }}>
          {items.map((item, i) => item === 'separator'
            ? <div key={i} role="separator" className="h-2 bg-black/30" />
            : (
              <button key={i} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked}
                disabled={item.disabled} onClick={() => { close(); item.onSelect() }}
                className={cx('flex min-h-11 w-full items-center gap-2.5 px-4 py-2 text-left text-body outline-none hover:bg-white/8 focus-visible:bg-white/12 disabled:text-label-3',
                  item.destructive ? 'text-red' : 'text-label', '[&+&]:shadow-[inset_0_0.5px_0_var(--color-sep)]')}>
                {options && <span className="-ml-1 grid w-5 shrink-0 place-items-center">{item.checked && <Check size={17} strokeWidth={2.6} />}</span>}
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.icon && <span className="-mr-1 grid w-6 shrink-0 place-items-center">{item.icon}</span>}
              </button>
            ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Déclencheur de menu en capsule : valeur actuelle et chevrons, comme un bouton « pull-down » d’iOS. */
export const pillClass = 'pressable inline-flex min-h-11 max-w-full items-center gap-2 rounded-[12px] bg-surface px-3 text-subhead font-semibold disabled:text-label-3'

/* ---------- Search field ---------- */

/** Champ de recherche iOS : loupe, 36 px, effacement rond. */
export function SearchField({ value, onChange, label, placeholder = 'Rechercher', className, maxLength }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string; maxLength?: number
}) {
  return (
    <div className={cx('flex h-12 items-center gap-2.5 rounded-[14px] bg-surface px-3.5 text-label-2 focus-within:ring-1 focus-within:ring-accent', className)}>
      <Search size={17} className="shrink-0" />
      <input type="search" maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" aria-label="Effacer la recherche" onClick={() => onChange('')}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-label-2">
          <span className="grid size-[17px] place-items-center rounded-full bg-label-3 text-bg"><X size={12} strokeWidth={3} /></span>
        </button>
      )}
    </div>
  )
}

/* ---------- Disclosure ---------- */

/** Détail repliable, avec chevron qui pivote ; fond de liste groupée (plus clair dans une feuille). */
export function Disclosure({ title, children, className, defaultOpen }: { title: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className={cx('group group-bg overflow-hidden rounded-[12px] bg-surface', className)}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-body select-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{title}</span>
        <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-label-3 transition-transform duration-300 ease-ios group-open:rotate-90" />
      </summary>
      {children}
    </details>
  )
}

/** Faits en lignes courtes libellé / valeur, séparés en retrait. */
export function Facts({ rows, className }: { rows: (readonly [ReactNode, ReactNode])[]; className?: string }) {
  return (
    <dl className={cx('text-subhead', className)}>
      {rows.map(([label, value], i) => (
        <div key={i} className="ml-4 flex min-h-11 items-center justify-between gap-3 py-2 pr-4 shadow-[inset_0_0.5px_0_var(--color-sep)]">
          <dt className="min-w-0 text-label-2">{label}</dt>
          <dd className="num min-w-0 text-right text-pretty wrap-anywhere text-label">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- Status dot ---------- */

/** Pastille d’état : couleur de rôle et libellé, jamais la couleur seule. */
export function StatusLabel({ tone, children, pulse }: { tone: 'green' | 'orange' | 'red' | 'gray'; children: ReactNode; pulse?: boolean }) {
  const color = { green: 'var(--color-green)', orange: 'var(--color-orange)', red: 'var(--color-red)', gray: 'var(--color-label-3)' }[tone]
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: tone === 'gray' ? 'var(--color-label-2)' : color }}>
      <span aria-hidden className={cx('size-2 shrink-0 rounded-full', pulse && 'animate-pulse-dot')} style={{ background: color }} />
      {children}
    </span>
  )
}

/* ---------- Grouped lists ---------- */

export function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-title2">{title}</h2>
      {action && href && (
        <a href={href} className="pressable -my-2 flex min-h-11 items-center text-body text-accent">
          {action}
        </a>
      )}
    </div>
  )
}

export function Group({ children, className, header, footer }: { children: ReactNode; className?: string; header?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={className}>
      {header && <h2 className="mb-2 px-1 text-subhead font-semibold text-label-2">{header}</h2>}
      <div className="group-bg overflow-hidden rounded-[16px] bg-surface">{children}</div>
      {footer && <p className="mt-2 px-4 text-footnote text-label-2">{footer}</p>}
    </div>
  )
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  href,
  onClick,
  chevron = !!(href || onClick),
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  chevron?: boolean
  className?: string
}) {
  const body = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="row-sep flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 self-stretch py-3 pr-4">
        <div className="min-w-0 flex-1">
          <div className="text-body wrap-anywhere">{title}</div>
          {subtitle && <div className="mt-0.5 text-footnote text-label-2">{subtitle}</div>}
        </div>
        {trailing && <div className="min-w-0 max-w-[54%] text-right text-body wrap-anywhere text-label-2">{trailing}</div>}
        {chevron && <ChevronRight size={18} strokeWidth={2.4} className="-mr-1 shrink-0 text-label-3" />}
      </div>
    </>
  )
  const cls = cx('g-row flex w-full items-center gap-3 pl-4 text-left transition-colors', (href || onClick) && 'active:bg-fill-4 desk:hover:bg-fill-4', className)
  if (href) return <a href={href} className={cls}>{body}</a>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

/* ---------- Icon tile (Settings-style) ---------- */

export function Tile({ children, color = 'var(--color-accent)', size = 32 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[8px]"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      {children}
    </span>
  )
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  className,
  variant = 'default',
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
  disabled?: boolean
  className?: string
  variant?: 'default' | 'course'
}) {
  const idx = options.findIndex((o) => o.value === value)
  const inset = variant === 'course' ? 0 : 2
  return (
    <div role="radiogroup" aria-label={label} className={cx('relative grid', variant === 'course' ? 'live-view-switch' : 'segmented min-h-12 rounded-[14px] bg-fill-3 p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className={variant === 'course' ? 'live-view-switch-thumb' : 'absolute top-0.5 bottom-0.5 rounded-[12px] bg-surface-3 transition-transform duration-200 ease-ios'}
        style={{ left: inset, width: `calc((100% - ${inset * 2}px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o, index) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          tabIndex={value === o.value ? 0 : -1}
          onKeyDown={event => {
            const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
            if (!delta) return
            event.preventDefault()
            const next = (index + delta + options.length) % options.length
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
            onChange(options[next].value)
          }}
          onClick={() => o.value !== value && onChange(o.value)}
          className={variant === 'course' ? 'live-view-switch-option' : cx('relative z-10 min-h-11 min-w-0 rounded-[12px] px-1 py-1 text-footnote hyphens-auto wrap-anywhere transition-colors',
            o.value === value ? 'font-semibold text-label' : 'font-medium text-label-2', 'disabled:text-label-3')}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Switch ---------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ease-ios after:absolute after:inset-x-0 after:-inset-y-2', checked ? 'bg-green' : 'bg-fill')}
    >
      <span
        className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_3px_1px_rgba(0,0,0,.06)] transition-transform duration-300 ease-ios"
        style={{ transform: checked ? 'translateX(20px)' : 'none' }}
      />
    </button>
  )
}

/* ---------- Avatar ---------- */

export function Avatar({ initial, size = 34, onClick, label }: { initial: string; size?: number; onClick?: () => void; label?: string }) {
  const disc = (
    <span
      aria-hidden={onClick ? true : undefined}
      className="grid shrink-0 place-items-center rounded-full bg-[#273021] font-bold text-[#dcf3bc] ring-1 ring-inset ring-white/12"
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {initial}
    </span>
  )
  if (!onClick) return disc
  // Cible de 44 px au moins, sans changer la place occupée par le disque.
  const hit = Math.max(44, size)
  return (
    <button type="button" onClick={onClick} aria-label={label} className="pressable grid shrink-0 place-items-center rounded-full"
      style={{ width: hit, height: hit }}>
      {disc}
    </button>
  )
}

/* ---------- Rows with a control ---------- */

/** Ligne de liste groupée avec un contrôle à droite et son erreur en rouge sous la ligne. */
export function ControlRow({ title, control, error }: { title: ReactNode; control: ReactNode; error?: string }) {
  return (
    <div className="g-row pl-4">
      <div className="row-sep flex min-h-11 items-center gap-3 py-1.5 pr-4">
        <div className="min-w-0 flex-1 text-body">{title}</div>
        <div className="shrink-0">{control}</div>
      </div>
      {error && <p role="alert" className="pr-4 pb-2.5 text-footnote text-red">{error}</p>}
    </div>
  )
}

/** Entier borné : boutons − / + de 44 px et valeur saisissable au clavier, validée à la sortie du champ. */
export function Stepper({ value, min, max, onChange, label, disabled, onInvalid, step: increment = 1, unit, color }: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
  /** Saisie hors limites : message à afficher, ou undefined une fois corrigée. */
  onInvalid: (message: string | undefined) => void
  /** Pas des boutons − / + ; la saisie au clavier reste libre dans les bornes. */
  step?: number
  unit?: string
  /** Couleur de rôle de la valeur. */
  color?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const range = `Entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`
  const commit = () => {
    if (draft === null) return
    const text = draft.trim().replace(/\s/g, '')
    const n = Number(text)
    if (!/^\d+$/.test(text) || n < min || n > max) {
      onInvalid(range)
      return
    }
    setDraft(null)
    onInvalid(undefined)
    if (n !== value) onChange(n)
  }
  // Les boutons ramènent d’abord sur un multiple du pas, comme un minuteur.
  const step = (delta: number) => {
    setDraft(null)
    onInvalid(undefined)
    const next = delta > 0 ? Math.floor(value / increment) * increment + increment : Math.ceil(value / increment) * increment - increment
    onChange(Math.min(max, Math.max(min, next)))
  }
  const invalid = draft !== null && !(/^\d+$/.test(draft.trim()) && +draft >= min && +draft <= max)
  return (
    <div className="flex items-center gap-1">
      <span className="flex items-baseline">
      <input
        inputMode="numeric"
        enterKeyHint="done"
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={(e) => { setDraft((d) => d ?? String(value)); e.target.select() }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(null); onInvalid(undefined) }
        }}
        className={cx('num h-11 rounded-[8px] bg-transparent text-body font-semibold outline-none focus:bg-fill-3 disabled:text-label-3',
          max >= 1000 ? 'w-14' : 'w-11', unit ? 'pr-1 text-right' : 'text-center', invalid && 'text-red')}
        style={invalid || disabled ? undefined : { color }}
      />
      {unit && <span className="mr-1.5 text-subhead text-label-2">{unit}</span>}
      </span>
      <div className="flex min-h-11 items-center rounded-[12px] bg-fill-3">
        <button type="button" aria-label={`Diminuer : ${label}`} disabled={disabled || value <= min} onClick={() => step(-1)}
          className="grid h-11 w-11 place-items-center active:opacity-50 disabled:text-label-3">
          <Minus size={18} strokeWidth={2.4} />
        </button>
        <span className="h-4 w-px bg-sep" />
        <button type="button" aria-label={`Augmenter : ${label}`} disabled={disabled || value >= max} onClick={() => step(1)}
          className="grid h-11 w-11 place-items-center active:opacity-50 disabled:text-label-3">
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}

/* ---------- Sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  leading,
  trailing,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  /** Action principale toujours visible en bas de la feuille. */
  footer?: ReactNode
  /** Feuille de 640 px sur PC, pour un aperçu avec graphique. */
  wide?: boolean
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    const previousInert = root?.inert ?? false
    if (root) root.inert = true
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(node => node.getClientRects().length > 0)
    ;(focusable()[0] ?? panel.current)?.focus({preventScroll: true})
    const onKey = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) !== panel.current || (e.target instanceof Element && e.target.closest('[role="menu"]'))) return
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current() }
      if (e.key !== 'Tab') return
      const nodes = focusable()
      if (!nodes.length) { e.preventDefault(); return }
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus() }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      if (root) root.inert = previousInert
      previousFocus?.focus({ preventScroll: true })
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center desk:items-center">
      <div className="animate-fade absolute inset-0 bg-black/70" onClick={onClose} />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined}
        className={cx('sheet-panel animate-sheet relative flex w-full min-w-0 flex-col overflow-hidden rounded-t-[24px] bg-surface desk:rounded-[22px]',
        wide ? 'desk:max-w-[640px]' : 'desk:max-w-[480px]')}>
        <div className="shrink-0 px-4 pb-1">
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-label-3 desk:hidden" />
          <div className="flex min-h-14 items-center gap-3 py-1">
            {leading}
            {title && <h2 id={id} className="min-w-0 flex-1 text-headline text-pretty wrap-anywhere">{title}</h2>}
            {trailing}
            {!leading && !trailing && <button type="button" aria-label="Fermer" onClick={onClose} className="pressable ml-auto grid size-11 shrink-0 place-items-center rounded-full bg-fill-3"><X size={18} /></button>}
          </div>
        </div>
        <div className={cx('min-h-0 overflow-y-auto overscroll-contain px-4 pt-2 [&_.group-bg]:bg-surface-2', footer ? 'pb-4' : 'pb-[max(24px,env(safe-area-inset-bottom))]')}>{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-sep px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Metric ---------- */

export function Metric({ label, value, unit, color, size = 'md' }: { label: string; value: ReactNode; unit?: string; color?: string; size?: 'md' | 'lg' }) {
  return (
    <div className="min-w-0">
      <div className="text-footnote text-label-2">{label}</div>
      <div className={cx('num mt-0.5 font-semibold', size === 'lg' ? 'text-[34px] leading-[38px] tracking-[-0.02em]' : 'text-[26px] leading-[30px] tracking-[-0.015em]')}
        style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-[0.55em] font-semibold tracking-normal text-label-2">{unit}</span>}
      </div>
    </div>
  )
}

/* ---------- Stat grid (Forme : mesure colorée, unité en capitales) ---------- */

export interface Stat {
  label: string
  /** null : valeur inconnue, affichée « -- » en label-3. */
  value: string | null
  unit?: string
  color: string
  /** Occupe toute la ligne sur téléphone. */
  wide?: boolean
}

/** Cellules séparées par des filets, comme le détail d’un exercice dans Forme. */
export function StatGrid({ stats, className, compact = false }: { stats: Stat[]; className?: string; compact?: boolean }) {
  return (
    <dl className={cx('stat-grid grid grid-cols-2 gap-px overflow-hidden rounded-[16px] bg-sep-opaque',
      !compact && 'desk:grid-flow-col desk:auto-cols-fr desk:grid-cols-none', className)}>
      {stats.map((s) => (
        <div key={s.label} className={cx('group-bg min-w-0 bg-surface px-3.5 py-3 desk:px-4', s.wide && 'col-span-2 desk:col-span-1')}>
          <dt className="text-footnote font-medium text-label-2">{s.label}</dt>
          <dd data-long-value={s.value !== null && s.value.length >= 8 ? 'true' : undefined} className="num mt-1 flex flex-wrap items-baseline gap-x-1 text-[26px] leading-[32px] font-semibold tracking-[-0.025em]"
            style={{ color: s.value === null ? 'var(--color-label-3)' : s.color }}>
            <span className="stat-value">{s.value ?? '--'}</span>
            {s.unit && s.value !== null && <small className="text-footnote font-semibold uppercase">{s.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- Activity glyph ---------- */

/** Pastille ronde de l’activité, comme les icônes d’exercice de Forme. */
export function Glyph({ children, size = 44, color = 'var(--color-accent)' }: { children: ReactNode; size?: number; color?: string }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 16%, #000)` }}>
      {children}
    </span>
  )
}

/* ---------- Skeleton ---------- */

/** Chargement : la forme du contenu attendu, sans texte décoratif. */
export function Skeleton({ label, cards = 1 }: { label: string; cards?: number }) {
  return (
    <div role="status" className="grid gap-3 desk:grid-cols-2 desk:gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} aria-hidden className="animate-pulse rounded-[22px] bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-full bg-fill-3" />
            <div className="h-4 w-1/2 rounded bg-fill-3" />
          </div>
          <div className="mt-5 h-7 w-2/3 rounded bg-fill-4" />
          <div className="mt-5 h-14 rounded-[8px] bg-fill-4" />
        </div>
      ))}
    </div>
  )
}
