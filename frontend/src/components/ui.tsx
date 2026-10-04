import { ChevronRight } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
    <div className="mb-2 flex items-end justify-between px-1">
      <h2 className="text-title3">{title}</h2>
      {action && href && (
        <a href={href} className="pressable text-subhead text-accent">
          {action}
        </a>
      )}
    </div>
  )
}

export function Group({ children, className, footer }: { children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <div className={className}>
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
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
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
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 px-2 text-footnote font-medium transition-colors', o.value === value ? 'font-semibold text-label' : 'text-label')}
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pressable grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#8e8e93] to-[#636366] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {initial}
    </button>
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
