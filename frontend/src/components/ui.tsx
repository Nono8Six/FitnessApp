import { ChevronRight, Minus, Plus } from 'lucide-react'
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
        size === 'lg' && 'h-[52px] rounded-[14px] px-5 text-headline',
        size === 'md' && 'h-11 rounded-[12px] px-4 text-subhead',
        size === 'sm' && 'h-8 rounded-full px-3.5 text-subhead',
        variant === 'primary' && 'bg-accent text-on-accent disabled:bg-fill-3 disabled:text-label-3',
        variant === 'gray' && 'bg-fill-3 text-label disabled:text-label-3',
        variant === 'plain' && 'text-accent disabled:text-label-3',
        variant === 'danger' && 'bg-red/15 text-red disabled:opacity-35',
        className,
      )}
    />
  )
}

/* ---------- Grouped lists ---------- */

export function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
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
      {header && <h2 className="mb-1.5 px-4 text-footnote font-normal tracking-[0.01em] text-label-2 uppercase">{header}</h2>}
      <div className="group-bg overflow-hidden rounded-[12px] bg-surface">{children}</div>
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
      <div className="row-sep flex min-h-11 min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-4">
        <div className="min-w-0 flex-1">
          <div className="text-body">{title}</div>
          {subtitle && <div className="mt-0.5 text-footnote text-label-2">{subtitle}</div>}
        </div>
        {trailing && <div className="shrink-0 text-body text-label-2">{trailing}</div>}
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
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  const idx = options.findIndex((o) => o.value === value)
  return (
    <div role="radiogroup" aria-label={label} className={cx('relative grid h-8 rounded-[9px] bg-fill-3 p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 rounded-[7px] bg-[#636366] shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)] transition-transform duration-300 ease-ios"
        style={{ left: 2, width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => o.value !== value && onChange(o.value)}
          // La piste mesure 32 px comme sur iOS ; la zone de toucher déborde jusqu’à 44 px.
          className={cx("relative z-10 px-2 text-footnote font-medium transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
            o.value === value ? 'font-semibold text-label' : 'text-label', 'disabled:text-label-3')}
        >
          {o.label}
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
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ease-ios', checked ? 'bg-green' : 'bg-fill')}
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
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#8e8e93] to-[#636366] font-semibold text-white"
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
      style={{ width: hit, height: hit, margin: (size - hit) / 2 }}>
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
export function Stepper({ value, min, max, onChange, label, disabled, onInvalid }: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
  /** Saisie hors limites : message à afficher, ou undefined une fois corrigée. */
  onInvalid: (message: string | undefined) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const text = draft.trim()
    const n = Number(text)
    if (!/^\d+$/.test(text) || n < min || n > max) {
      onInvalid(`Entre ${min} et ${max}`)
      return
    }
    setDraft(null)
    onInvalid(undefined)
    if (n !== value) onChange(n)
  }
  const step = (delta: number) => {
    setDraft(null)
    onInvalid(undefined)
    onChange(Math.min(max, Math.max(min, value + delta)))
  }
  const invalid = draft !== null && !(/^\d+$/.test(draft.trim()) && +draft >= min && +draft <= max)
  return (
    <div className="flex items-center gap-1">
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
        className={cx('num h-11 w-11 rounded-[8px] bg-transparent text-center text-body font-semibold outline-none focus:bg-fill-3 disabled:text-label-3',
          invalid && 'text-red')}
      />
      <div className="flex h-8 items-center rounded-[8px] bg-fill-3">
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
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center desk:items-center" role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined}>
      <div className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="animate-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[14px] bg-surface pb-safe desk:max-w-[480px] desk:rounded-[14px] desk:pb-0">
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur-xl">
          <div className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-label-3 desk:hidden" />
          {(title || leading || trailing) && (
            <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-4">
              <div className="justify-self-start">{leading}</div>
              {title && <h2 id={id} className="text-headline">{title}</h2>}
              <div className="justify-self-end">{trailing}</div>
            </div>
          )}
        </div>
        <div className="px-4 pt-2 pb-6 [&_.group-bg]:bg-surface-2">{children}</div>
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
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-2 gap-px overflow-hidden rounded-[12px] bg-sep-opaque desk:grid-flow-col desk:auto-cols-fr desk:grid-cols-none', className)}>
      {stats.map((s) => (
        <div key={s.label} className={cx('min-w-0 bg-surface px-3.5 py-3 desk:px-4', s.wide && 'col-span-2 desk:col-span-1')}>
          <dt className="truncate text-subhead text-label">{s.label}</dt>
          <dd className="num mt-0.5 text-[26px] leading-[32px] font-semibold tracking-[-0.01em] whitespace-nowrap"
            style={{ color: s.value === null ? 'var(--color-label-3)' : s.color }}>
            {s.value ?? '--'}
            {s.unit && s.value !== null && <span className="ml-0.5 text-[17px] font-semibold uppercase">{s.unit}</span>}
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
