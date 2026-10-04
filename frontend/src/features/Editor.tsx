import { Minus, Plus, Repeat as RepeatIcon, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ProgrammeChart } from '../components/charts'
import { Page } from '../components/Shell'
import { cx } from '../components/ui'
import { expand, isRepeat, KIND_LABEL, programmeById, summary, type BlockKind, type Item, type Step } from '../data/demo'
import { clock, dec1 } from '../lib/format'
import { href, navigate } from '../lib/router'

const LIMITS = { speed: [1, 16], incline: [0, 3], min: [0.5, 60] } as const
const MAX_TOTAL_SEC = 60 * 60

type Field = 'sec' | 'speed' | 'incline'

function parse(v: string) {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function stepError(s: Step): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {}
  if (!(s.speed >= LIMITS.speed[0] && s.speed <= LIMITS.speed[1])) e.speed = `Entre ${LIMITS.speed[0]} et ${LIMITS.speed[1]} km/h`
  if (!(s.incline >= LIMITS.incline[0] && s.incline <= LIMITS.incline[1])) e.incline = `Entre 0 et ${LIMITS.incline[1]} %`
  if (!(s.sec >= LIMITS.min[0] * 60 && s.sec <= LIMITS.min[1] * 60)) e.sec = 'Entre 0,5 et 60 min'
  return e
}

function Stepper({ value, onChange, step, label, unit, error, format }: {
  value: number; onChange: (v: number) => void; step: number; label: string; unit: string; error?: string; format: (v: number) => string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="g-row flex flex-col pl-4">
      <div className="row-sep flex min-h-11 items-center gap-3 py-1.5 pr-3">
        <span className="flex-1 text-body">{label}</span>
        <label className="flex items-baseline gap-1">
          <input
            inputMode="decimal"
            aria-label={`${label} (${unit})`}
            aria-invalid={!!error}
            value={draft ?? format(value)}
            onFocus={(e) => { setDraft(format(value)); e.target.select() }}
            onChange={(e) => { setDraft(e.target.value); const n = parse(e.target.value); if (!Number.isNaN(n)) onChange(n) }}
            onBlur={() => setDraft(null)}
            className={cx('num w-14 rounded-[6px] bg-transparent text-right text-body font-semibold outline-none focus:bg-fill-3', error && 'text-red')}
          />
          <span className="w-9 text-subhead text-label-2">{unit}</span>
        </label>
        <div className="flex h-8 items-center rounded-[8px] bg-fill-3">
          <button aria-label={`Diminuer ${label}`} onClick={() => onChange(+(value - step).toFixed(2))} className="grid h-full w-11 place-items-center active:bg-fill-2 rounded-l-[8px]">
            <Minus size={18} strokeWidth={2.4} />
          </button>
          <span className="h-4 w-px bg-sep" />
          <button aria-label={`Augmenter ${label}`} onClick={() => onChange(+(value + step).toFixed(2))} className="grid h-full w-11 place-items-center active:bg-fill-2 rounded-r-[8px]">
            <Plus size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {error && <div className="-mt-1 pr-4 pb-2 text-right text-footnote text-red" role="alert">{error}</div>}
    </div>
  )
}

function StepFields({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const e = stepError(step)
  return (
    <>
      <Stepper label="Durée" unit="min" step={0.5} value={step.sec / 60} format={(v) => dec1(v).replace(',0', '')} error={e.sec}
        onChange={(v) => onChange({ ...step, sec: Math.round(v * 60) })} />
      <Stepper label="Vitesse" unit="km/h" step={0.5} value={step.speed} format={dec1} error={e.speed}
        onChange={(v) => onChange({ ...step, speed: v })} />
      <Stepper label="Pente" unit="%" step={0.5} value={step.incline} format={dec1} error={e.incline}
        onChange={(v) => onChange({ ...step, incline: v })} />
    </>
  )
}

function GroupTitle({ title, onDelete, children }: { title: string; onDelete?: () => void; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-4">
      <h3 className="text-footnote font-semibold tracking-[0.02em] text-label-2 uppercase">{title}</h3>
      <div className="flex items-center gap-3">
        {children}
        {onDelete && (
          <button onClick={onDelete} aria-label={`Supprimer ${title}`} className="pressable grid size-8 place-items-center rounded-full text-label-2 hover:text-red">
            <Trash2 size={17} />
          </button>
        )}
      </div>
    </div>
  )
}

const KIND_ORDER: BlockKind[] = ['warmup', 'steady', 'run', 'recover', 'cooldown']

export function Editor({ id }: { id?: string }) {
  const source = id ? programmeById(id) : undefined
  const [name, setName] = useState(source?.name ?? 'Nouvelle séance')
  const [items, setItems] = useState<Item[]>(() => structuredClone(source?.items ?? [
    { kind: 'warmup', sec: 300, speed: 6, incline: 0 },
    { kind: 'cooldown', sec: 300, speed: 5, incline: 0 },
  ]))
  const [saved, setSaved] = useState(false)

  const blocks = useMemo(() => expand(items), [items])
  const s = summary(blocks)
  const invalidStep = blocks.some((b) => Object.keys(stepError(b)).length > 0)
  const tooLong = s.sec > MAX_TOTAL_SEC
  const invalid = invalidStep || tooLong || !name.trim() || blocks.length === 0

  const update = (i: number, next: Item | null) => {
    setSaved(false)
    setItems((list) => (next === null ? list.filter((_, j) => j !== i) : list.map((x, j) => (j === i ? next : x))))
  }
  const insertBeforeCooldown = (item: Item) => {
    setSaved(false)
    setItems((list) => {
      const last = list.at(-1)
      const at = last && !isRepeat(last) && last.kind === 'cooldown' ? list.length - 1 : list.length
      return [...list.slice(0, at), item, ...list.slice(at)]
    })
  }

  return (
    <Page
      title={source ? 'Modifier' : 'Nouvelle séance'}
      back={{ label: 'Séances', href: href.library }}
      showAvatar={false}
      trailing={
        <button disabled={invalid} onClick={() => { setSaved(true); setTimeout(() => navigate(href.library), 500) }}
          className="pressable text-headline text-accent disabled:text-label-3">
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      }
    >
      <div className="grid gap-8 desk:grid-cols-[minmax(0,1fr)_380px] desk:items-start">
        <div className="grid gap-7">
          <div>
            <label className="block overflow-hidden rounded-[12px] bg-surface">
              <span className="sr-only">Nom de la séance</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }}
                className="h-12 w-full bg-transparent px-4 text-body outline-none placeholder:text-label-3" placeholder="Nom" />
            </label>
          </div>

          {items.map((item, i) =>
            isRepeat(item) ? (
              <section key={i} aria-label={`Répétition ${item.repeat} fois`}>
                <GroupTitle title={`Répétition`} onDelete={() => update(i, null)}>
                  <div className="flex h-8 items-center gap-1 rounded-[8px] bg-fill-3 pl-3">
                    <RepeatIcon size={14} className="text-accent" />
                    <span className="num w-7 text-center text-subhead font-semibold">×{item.repeat}</span>
                    <button aria-label="Moins de répétitions" onClick={() => update(i, { ...item, repeat: Math.max(1, item.repeat - 1) })} className="grid h-8 w-9 place-items-center"><Minus size={16} strokeWidth={2.4} /></button>
                    <button aria-label="Plus de répétitions" onClick={() => update(i, { ...item, repeat: Math.min(20, item.repeat + 1) })} className="grid h-8 w-9 place-items-center"><Plus size={16} strokeWidth={2.4} /></button>
                  </div>
                </GroupTitle>
                <div className="overflow-hidden rounded-[12px] bg-surface">
                  {item.steps.map((st, k) => (
                    <div key={k} className={cx(k > 0 && 'border-t-[6px] border-black')}>
                      <div className="px-4 pt-3 pb-1 text-subhead font-semibold" style={{ color: st.kind === 'run' ? 'var(--color-accent)' : undefined }}>
                        {KIND_LABEL[st.kind]}
                      </div>
                      <StepFields step={st} onChange={(ns) => update(i, { ...item, steps: item.steps.map((x, j) => (j === k ? ns : x)) })} />
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section key={i} aria-label={KIND_LABEL[item.kind]}>
                <GroupTitle title={KIND_LABEL[item.kind]} onDelete={items.length > 1 ? () => update(i, null) : undefined} />
                <div className="overflow-hidden rounded-[12px] bg-surface">
                  <StepFields step={item} onChange={(ns) => update(i, ns)} />
                </div>
              </section>
            ),
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => insertBeforeCooldown({ kind: KIND_ORDER[1], sec: 600, speed: 7, incline: 0 })}
              className="pressable flex h-11 items-center justify-center gap-1.5 rounded-[12px] bg-surface text-subhead font-semibold text-accent">
              <Plus size={18} strokeWidth={2.6} />Bloc
            </button>
            <button onClick={() => insertBeforeCooldown({ repeat: 3, steps: [{ kind: 'run', sec: 120, speed: 8, incline: 0 }, { kind: 'recover', sec: 60, speed: 6, incline: 0 }] })}
              className="pressable flex h-11 items-center justify-center gap-1.5 rounded-[12px] bg-surface text-subhead font-semibold text-accent">
              <RepeatIcon size={17} strokeWidth={2.4} />Répétition
            </button>
          </div>
        </div>

        <aside className="order-first desk:sticky desk:top-16 desk:order-none" aria-label="Aperçu">
          <div className="rounded-[22px] bg-surface p-5">
            <dl className="grid grid-cols-3 gap-2">
              {[
                ['Durée', clock(s.sec), tooLong],
                ['Distance', `${dec1(s.km)} km`, false],
                ['Blocs', String(s.count), false],
              ].map(([k, v, bad]) => (
                <div key={String(k)}>
                  <dt className="text-caption text-label-2">{k}</dt>
                  <dd className={cx('num text-[22px] leading-7 font-semibold', bad && 'text-red')}>{v}</dd>
                </div>
              ))}
            </dl>
            {blocks.length > 0 && <ProgrammeChart blocks={blocks} maxSpeed={Math.max(10, s.maxSpeed)} height={64} className="mt-4" />}
            {tooLong && <p className="mt-3 text-footnote text-red" role="alert">Durée maximale : 60:00.</p>}
          </div>
        </aside>
      </div>
    </Page>
  )
}
