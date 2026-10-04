import { ArrowUp, Check, CloudOff } from 'lucide-react'
import { useState } from 'react'
import { ProgrammeChart } from '../components/charts'
import { Page } from '../components/Shell'
import { Button, cx } from '../components/ui'
import { expand, HISTORY, PROFILES, programmeById, shortDate, summary, type Programme } from '../data/demo'
import { clock, dec1, dec2 } from '../lib/format'
import { useProfile } from '../lib/profile'
import { href, navigate, scenario } from '../lib/router'

const base = programmeById('rythme')
const proposal: Programme = {
  id: 'rythme-v2',
  name: 'Trouver son rythme · v2',
  items: base.items.map((i) => ('repeat' in i ? { ...i, steps: i.steps.map((s) => (s.kind === 'run' ? { ...s, speed: 8.5 } : s)) } : i)),
}

function Sources() {
  const sessions = HISTORY.arnaud.filter((s) => s.programmeId === 'rythme' && s.date >= '2026-09-26' && s.date <= '2026-09-30').reverse()
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {sessions.map((s) => (
        <a key={s.id} href={href.session(s.id)} className="pressable num rounded-full bg-fill-3 px-3 py-1.5 text-footnote text-label">
          {shortDate(s.date)} · {dec2(s.km)} km · {s.rpe === null ? 'ressenti absent' : `${s.rpe}/10`}
        </a>
      ))}
    </div>
  )
}

function Proposal() {
  const [saved, setSaved] = useState(false)
  const a = summary(expand(base.items))
  const b = summary(expand(proposal.items))
  const rows: [string, string, string][] = [
    ['Course', `${dec1(8)} km/h`, `${dec1(8.5)} km/h`],
    ['Distance', `${dec2(a.km)} km`, `${dec2(b.km)} km`],
    ['Durée', clock(a.sec), clock(b.sec)],
  ]
  return (
    <section className="rounded-[22px] bg-surface p-5" aria-labelledby="proposal-title">
      <div className="text-footnote font-semibold text-accent">Proposition</div>
      <h2 id="proposal-title" className="mt-0.5 text-title3">{proposal.name}</h2>
      <ProgrammeChart blocks={expand(proposal.items)} maxSpeed={9} height={56} className="mt-4" />
      <dl className="mt-4">
        {rows.map(([k, from, to]) => (
          <div key={k} className="num flex items-center justify-between py-2 text-subhead shadow-[inset_0_-0.5px_0_var(--color-sep)] last:shadow-none">
            <dt className="text-label-2">{k}</dt>
            <dd>
              {from === to ? <span>{to}</span> : <><span className="text-label-3 line-through">{from}</span><span className="mx-1.5 text-label-3">→</span><span className="font-semibold">{to}</span></>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-3">
        <Button variant="gray" size="md" onClick={() => navigate(href.programme('rythme'))}>Modifier</Button>
        <Button size="md" onClick={() => setSaved(true)} disabled={saved}>
          {saved ? <><Check size={18} strokeWidth={2.6} />Brouillon</> : 'Enregistrer'}
        </Button>
      </div>
    </section>
  )
}

export function Coach() {
  const profile = useProfile()
  const offline = scenario() === 'coach-offline'
  const [draft, setDraft] = useState('')
  const name = PROFILES[profile].name
  const count = HISTORY[profile].length
  const isArnaud = profile === 'arnaud'
  return (
    <Page title="Coach">
      <div className="grid gap-8 desk:grid-cols-[minmax(0,1fr)_380px] desk:items-start">
        <div className="min-w-0">
          <p className="mb-6 text-footnote text-label-2">
            Accès : {count} séances d’{name}, objectif {PROFILES[profile].goal} par semaine.
          </p>

          {offline && (
            <div role="status" className="mb-6 flex items-center gap-2.5 rounded-[14px] bg-fill-4 px-4 py-3 text-subhead text-label-2">
              <CloudOff size={18} className="shrink-0" />Coach hors ligne. Séances et historique restent disponibles.
            </div>
          )}

          {isArnaud ? (
            <div className="grid gap-6">
              <div className="ml-auto max-w-[min(82%,480px)] rounded-[20px] rounded-br-[6px] bg-accent px-4 py-2.5 text-body text-on-accent">
                Comment progresser sans rendre la prochaine séance trop difficile ?
              </div>
              <div className="max-w-[640px] text-body">
                <p>
                  Sur tes trois dernières « Trouver son rythme », la distance passe de <b className="num">3,22</b> à <b className="num">3,28 km</b>.
                  En course, tu tiens <b className="num">7,9 km/h</b> pour <b className="num">8,0</b> ciblés. L’effort perçu baisse de <b className="num">6</b> à <b className="num">5</b>.
                </p>
                <p className="mt-3">
                  Proposition : course à <b className="num">8,5 km/h</b>, mêmes récupérations, même durée.
                </p>
                <Sources />
              </div>
              <div className="desk:hidden"><Proposal /></div>
            </div>
          ) : (
            <p className="py-6 text-center text-subhead text-label-2">Aucune conversation.</p>
          )}
        </div>
        <aside className="hidden desk:sticky desk:top-16 desk:block">{isArnaud && <Proposal />}</aside>
      </div>
      <div aria-hidden className="h-24" />

      <form
        onSubmit={(e) => { e.preventDefault(); setDraft('') }}
        className="fixed inset-x-0 bottom-[calc(50px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-black via-black to-black/0 px-4 pt-6 pb-3 desk:left-[248px] desk:bottom-0 desk:pb-6"
      >
        <div className="mx-auto flex max-w-[680px] flex-col gap-2 desk:max-w-[760px]">
          {!offline && !draft && (
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {['Analyser ma semaine', 'Séance de 20 min', 'Comparer avec Ophélie'].map((t) => (
                <button key={t} type="button" onClick={() => setDraft(t)} className="pressable h-8 shrink-0 rounded-full bg-surface px-3.5 text-footnote font-medium text-label">
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className={cx('flex items-end gap-2 rounded-[22px] bg-surface p-1.5 pl-4 ring-[0.5px] ring-white/10', offline && 'opacity-50')}>
            <textarea
              rows={1}
              value={draft}
              disabled={offline}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={offline ? 'Indisponible' : 'Message'}
              aria-label="Message au coach"
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-body outline-none placeholder:text-label-3"
            />
            <button type="submit" disabled={offline || !draft.trim()} aria-label="Envoyer"
              className="pressable grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:bg-fill-3 disabled:text-label-3">
              <ArrowUp size={18} strokeWidth={2.8} />
            </button>
          </div>
        </div>
      </form>
    </Page>
  )
}
