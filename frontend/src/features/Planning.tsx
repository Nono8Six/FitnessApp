import { CalendarDays, Target } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { CoachIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { Button, Chip, Disclosure, Group, Row, Segmented, Sheet, Skeleton, StatusLabel, Tile } from '../components/ui'
import { WorkoutError, WorkoutSummary } from '../components/WorkoutSummary'
import { errorMessage } from '../lib/api'
import { clock, dec2 } from '../lib/format'
import { href } from '../lib/router'
import { acceptSchedule, dayText, saveOutdoor, shiftDay, suggestSchedule, useSchedule, weekdayIndex, weekStart,
  type Availability, type PlanDraft, type PlanEntry, type Schedule, type SchedulePhase } from '../lib/schedule'
import { StartButton } from './Direct'
import { entryStatus, MonthPlanning, PlanningDays, PlanningToolbar, shortDays, venueText } from './PlanningCalendar'

const longLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const venues = [{ value: 'treadmill', label: 'Tapis' }, { value: 'outdoor', label: 'Dehors' }, { value: 'both', label: 'Les deux' }] as const
const field = 'block min-h-12 w-full min-w-0 rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-[16px] leading-snug placeholder:text-label-3 disabled:text-label-2'
const label = 'mb-2 block text-subhead font-semibold'

function Phases({ phases }: { phases: SchedulePhase[] }) {
  if (!phases.length) return null
  return <Disclosure title="Étapes jusqu’à l’objectif">
    <ol className="grid gap-3 px-4 pb-4">{phases.map(phase => <li key={phase.until} className="border-l-2 border-sep pl-3">
      <time dateTime={phase.until} className="text-footnote font-semibold text-accent">Jusqu’au {dayText(phase.until)}</time>
      <p className="mt-0.5 text-subhead wrap-anywhere">{phase.focus}</p>
    </li>)}</ol>
  </Disclosure>
}

function SetupSheet({ data, profile, report, close, receive }: {
  data: Schedule; profile: string; report?: string; close: () => void; receive: (draft: PlanDraft) => void
}) {
  const id = useId()
  const [availability, set] = useState<Availability>(data.proposal?.request.availability ?? data.available
    ?? { weekdays: [], minutes: 30, venue: 'treadmill', baseline: '' })
  const [minutes, setMinutes] = useState(String(availability.minutes))
  const [note, setNote] = useState(data.proposal?.request.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const max = Number(minutes)
  const possible = availability.weekdays.some(i => {
    const day = shiftDay(data.week, i)
    return day >= data.today && (!data.goal?.target_date || day <= data.goal.target_date)
      && !data.plan?.sessions.some(entry => entry.day === day && entry.status !== 'planned')
  })
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !possible || !Number.isInteger(max) || max < 15 || max > 120) return
    setBusy(true); setError('')
    try {
      receive(await suggestSchedule(profile, {
        week: data.week, availability: { ...availability, minutes: max, baseline: availability.baseline.trim() },
        note: note.trim(), report_id: report,
      }))
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Sheet open title="Préparer la semaine" onClose={close} footer={
    <Button form={id} type="submit" className="w-full" disabled={busy || !possible || !Number.isInteger(max) || max < 15 || max > 120}>
      {busy ? 'Le coach prépare la semaine…' : 'Demander au coach'}
    </Button>
  }>
    <form id={id} onSubmit={submit}>
      <fieldset disabled={busy} className="grid min-w-0 gap-5">
        <fieldset className="min-w-0">
          <legend className={label}>Jours disponibles</legend>
          <div className="grid grid-cols-4 gap-1 min-[360px]:grid-cols-7 desk:gap-2">
            {shortDays.map((text, i) => <Chip key={text} type="button" aria-label={longLabels[i]}
              className="w-full justify-center !px-0"
              selected={availability.weekdays.includes(i)} onClick={() => set(current => ({
                ...current, weekdays: current.weekdays.includes(i) ? current.weekdays.filter(v => v !== i) : [...current.weekdays, i],
              }))}>{text}</Chip>)}
          </div>
          {availability.weekdays.length > 0 && !possible && <p className="mt-2 text-footnote text-orange">
            Aucun jour sélectionné ne reste disponible sur cette semaine.
          </p>}
        </fieldset>
        <div>
          <label className={label} htmlFor={`${id}-minutes`}>Temps maximal par séance</label>
          <div className="flex items-center gap-3">
            <input id={`${id}-minutes`} className={`${field} max-w-28`} type="number" inputMode="numeric" min={15} max={120}
              required value={minutes} onChange={event => setMinutes(event.target.value)} />
            <span className="text-subhead text-label-2">minutes</span>
          </div>
        </div>
        <div>
          <p className={label}>Où t’entraîner ?</p>
          <Segmented options={venues.map(item => ({ ...item }))} value={availability.venue}
            onChange={venue => set(current => ({ ...current, venue }))} label="Lieu d’entraînement" disabled={busy} />
        </div>
        <Disclosure title="Préciser ton niveau ou ta semaine">
          <div className="grid gap-4 px-1 pb-1 pt-1">
            <div><label className={label} htmlFor={`${id}-baseline`}>Point de départ (facultatif)</label>
              <textarea id={`${id}-baseline`} className={field} rows={2} maxLength={240}
                placeholder="Par exemple, je cours 20 minutes à l’aise."
                value={availability.baseline} onChange={event => set(current => ({ ...current, baseline: event.target.value }))} /></div>
            <div><label className={label} htmlFor={`${id}-note`}>Cette semaine (facultatif)</label>
              <textarea id={`${id}-note`} className={field} rows={2} maxLength={320}
                placeholder="Par exemple, une semaine chargée ou un besoin de récupération."
                value={note} onChange={event => setNote(event.target.value)} /></div>
          </div>
        </Disclosure>
      </fieldset>
      {busy && <p role="status" className="mt-3 text-footnote text-label-2">Le coach relit ton objectif, tes bilans et le planning. Tu peux fermer cette feuille.</p>}
      {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
    </form>
  </Sheet>
}

function ReviewSheet({ data, draft, profile, close, change, saved }: {
  data: Schedule; draft: PlanDraft; profile: string; close: () => void; change: () => void; saved: (value: Schedule) => void
}) {
  const [dates, setDates] = useState(draft.data.sessions.map(item => item.day))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = dates.flatMap((day, slot) => day ? [{ slot, day }] : [])
  const unique = new Set(chosen.map(item => item.day)).size === chosen.length
  const save = async () => {
    if (busy || !unique) return
    setBusy(true); setError('')
    try { saved(await acceptSchedule(profile, data.week, draft.id, chosen)) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Sheet open wide title="Proposition du coach" onClose={() => { if (!busy) close() }} footer={
    <Button className="w-full" disabled={busy || !unique} onClick={() => void save()}>
      {busy ? 'Enregistrement…' : chosen.length ? 'Enregistrer la semaine' : 'Valider sans séance prévue'}
    </Button>
  }>
    <h3 className="text-title2 wrap-anywhere">{draft.data.focus}</h3>
    <p className="mt-2 text-subhead leading-relaxed text-label-2 wrap-anywhere">{draft.data.explanation}</p>
    {draft.replaces.length > 0 && <Disclosure title="Séances prévues à remplacer" className="mt-4">
      <ul className="grid gap-2 px-4 pb-4 text-subhead text-label-2">{draft.replaces.map(item => <li key={item.day}>
        {dayText(item.day, true)} · {item.name}
      </li>)}</ul>
    </Disclosure>}
    {draft.data.sessions.length > 0 && <ol className="mt-5 grid gap-3">
      {draft.data.sessions.map((item, i) => <li key={`${item.day}-${i}`} className="min-w-0 rounded-[14px] bg-surface-2 p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4 className="min-w-0 text-headline wrap-anywhere">{item.name}</h4>
          <span className="text-footnote text-label-2">{item.minutes} min · {venueText(item.venue)} · effort {item.effort}/10</span>
        </div>
        <p className="mt-1 text-subhead leading-relaxed text-label-2 wrap-anywhere">{item.purpose}</p>
        <label className="mt-3 block">
          <span className="sr-only">Jour pour {item.name}</span>
          <select className={`${field} bg-fill-3`} value={dates[i]} disabled={busy}
            onChange={event => setDates(current => current.map((day, index) => index === i ? event.target.value : day))}>
            {draft.allowed.map(day => <option key={day} value={day}>{dayText(day, true)}</option>)}
            <option value="">Mettre de côté</option>
          </select>
        </label>
      </li>)}
    </ol>}
    {draft.data.phases.length > 0 && <div className="mt-4"><Phases phases={draft.data.phases} /></div>}
    {!unique && <p role="alert" className="mt-3 text-subhead text-orange">Choisis un jour différent pour chaque séance.</p>}
    {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
    <Button size="md" variant="plain" className="mt-3" disabled={busy} onClick={change}>Revoir mes créneaux</Button>
  </Sheet>
}

function OutdoorSheet({ profile, entry, data, close, saved }: {
  profile: string; entry: PlanEntry; data: Schedule; close: () => void; saved: (value: Schedule) => void
}) {
  const id = useId()
  const [minutes, setMinutes] = useState(String(entry.manual?.minutes ?? ''))
  const [km, setKm] = useState(entry.manual?.km == null ? '' : String(entry.manual.km).replace('.', ','))
  const [feeling, setFeeling] = useState(entry.manual?.feeling == null ? '' : String(entry.manual.feeling))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const distance = km.trim() ? Number(km.trim().replace(',', '.')) : null
  const duration = Number(minutes)
  const effort = feeling ? Number(feeling) : null
  const valid = Number.isInteger(duration) && duration > 0 && duration <= 720
    && (distance === null || distance > 0 && distance <= 200)
    && (effort === null || Number.isInteger(effort) && effort >= 1 && effort <= 10)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError('')
    try { saved(await saveOutdoor(profile, data.week, entry.id, data.revision, { minutes: duration, km: distance, feeling: effort })) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <Sheet open title="Bilan de ta sortie" onClose={() => { if (!busy) close() }} footer={
    <Button form={id} type="submit" className="w-full" disabled={!valid || busy}>{busy ? 'Enregistrement…' : 'Enregistrer le bilan'}</Button>
  }>
    <p className="mb-4 text-subhead text-label-2 wrap-anywhere">{entry.name} · {dayText(entry.day, true)}</p>
    <form id={id} onSubmit={submit}>
      <fieldset className="grid gap-4" disabled={busy}>
        <label><span className={label}>Durée réelle (min)</span><input className={field} type="number" inputMode="numeric"
          required min={1} max={720} value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
        <label><span className={label}>Distance (km, facultative)</span><input className={field} inputMode="decimal"
          maxLength={8} value={km} onChange={event => setKm(event.target.value)} /></label>
        <label><span className={label}>Effort ressenti sur 10 (facultatif)</span><input className={field}
          type="number" inputMode="numeric" min={1} max={10} value={feeling} onChange={event => setFeeling(event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-subhead text-red">{error}</p>}
    </form>
  </Sheet>
}

function SessionRow({ entry, today, profile, selected, log }: {
  entry: PlanEntry; today: string; profile: string; selected: boolean; log: () => void
}) {
  const state = entryStatus[entry.status]
  return <div id={`planning-session-${entry.day}`} className="planning-session-anchor">
    <Disclosure className={selected ? 'planning-session is-selected' : 'planning-session'} defaultOpen={selected} title={
    <span className="flex items-start gap-3">
      <span className="flex w-12 shrink-0 flex-col items-start border-r border-sep pr-2">
        <span className="text-footnote text-label-2">{shortDays[weekdayIndex(entry.day)]}</span>
        <span className={`num text-title2 ${entry.day === today ? 'text-accent' : ''}`}>{Number(entry.day.slice(-2))}</span>
      </span>
      <span className="min-w-0">
        <span className="block font-semibold wrap-anywhere">{entry.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-label-2">
          <span>{entry.minutes} min · {venueText(entry.venue)}</span>
          <StatusLabel tone={state.tone}>{state.label}</StatusLabel>
        </span>
      </span>
    </span>
  }>
    <div className="grid gap-3 border-t border-sep px-4 py-3">
      <p className="text-subhead leading-relaxed text-label-2 wrap-anywhere">{entry.purpose}</p>
      <p className="text-footnote text-label-2">Effort prévu {entry.effort}/10</p>
      {entry.workout && <>
        {entry.day <= today && <StartButton workout={entry.workout} profile={profile} />}
        <Disclosure className="bg-surface-2" title="Détails du programme">
          <div className="px-2 pb-2"><WorkoutSummary data={entry.workout} segments={entry.workout} compact /></div>
        </Disclosure>
      </>}
      {entry.venue === 'treadmill' && entry.status === 'planned' && !entry.workout && <p className="text-footnote text-orange">Programme indisponible.</p>}
      {entry.status === 'in_progress' ? <Group><Row href={href.direct} title="Revenir au Direct" /></Group>
        : entry.report && <Group><Row href={href.report(entry.report.id)} title="Voir le bilan"
        subtitle={`${clock(entry.report.active_s)}${entry.report.feeling == null ? '' : ` · effort ${entry.report.feeling}/10`}`} /></Group>}
      {entry.manual && <p className="text-subhead text-label-2">Déclaré · {entry.manual.minutes} min
        {entry.manual.km != null && ` · ${dec2(entry.manual.km)} km`}{entry.manual.feeling != null && ` · effort ${entry.manual.feeling}/10`}
      </p>}
      {entry.venue === 'outdoor' && entry.day <= today && <Button size="md" variant="gray" onClick={log}>
        {entry.manual ? 'Modifier le bilan' : 'Renseigner ma sortie'}
      </Button>}
    </div>
    </Disclosure>
  </div>
}

function WeekPlanning({ profile, week, day, report }: { profile: string; week?: string; day?: string; report?: string }) {
  const { state, reload, update } = useSchedule(profile, week)
  const [sheet, setSheet] = useState<'setup' | 'review'>()
  const [received, setReceived] = useState<PlanDraft>()
  const [entry, setEntry] = useState<PlanEntry>()
  const [notice, setNotice] = useState('')
  const [picked, setPicked] = useState(day)
  const close = () => { setSheet(undefined); setEntry(undefined) }
  const saved = (data: Schedule, message: string) => { update(data); setReceived(undefined); close(); setNotice(message) }
  const data = state.status === 'ok' ? state.data : undefined
  const weekEnd = data && shiftDay(data.week, 6)
  const range = data && weekEnd && `${data.week.slice(0, 7) === weekEnd.slice(0, 7)
    ? Number(data.week.slice(-2)) : dayText(data.week)} – ${dayText(weekEnd)}`
  const canPlan = data && data.week <= shiftDay(data.today, 7) && shiftDay(data.week, 6) >= data.today
  const draft = received ?? data?.proposal
  const sessions = data?.plan?.sessions ?? []
  const days = data ? Array.from({ length: 7 }, (_, i) => shiftDay(data.week, i)) : []
  const currentWeek = data && days.includes(data.today)
  const selected = data && (picked && days.includes(picked) ? picked : currentWeek ? data.today : sessions[0]?.day ?? data.week)
  const closed = sessions.filter(item => item.status === 'done' || item.status === 'shortened').length
  const missed = sessions.filter(item => item.status === 'missed').length
  const select = (date: string, reveal: boolean) => {
    setPicked(date)
    if (!reveal) return
    const anchor = document.getElementById(`planning-session-${date}`)
    const details = anchor?.querySelector('details')
    if (details) {
      details.open = true
      if (details.getBoundingClientRect().top > window.innerHeight * 0.68) anchor?.scrollIntoView({ block: 'start' })
    }
  }
  return <>
    <PlanningToolbar view="week" title={range} weekHref={data ? href.planningWeek(data.week, selected) : href.planning}
      monthHref={selected ? href.planningMonth(selected.slice(0, 7), selected) : href.planningMonth()}
      todayHref={data ? href.planningWeek(weekStart(data.today), data.today) : href.planning}
      previous={data && href.planningWeek(shiftDay(data.week, -7))}
      next={data && href.planningWeek(shiftDay(data.week, 7))} />
    {state.status === 'loading' && <Skeleton label="Chargement de la semaine" />}
    {state.status === 'error' && <WorkoutError message={state.message} retry={reload} />}
    {data && selected && <>
      <div className="planning-week-layout planning-week-top">
        <PlanningDays days={days} selected={selected} today={data.today} sessions={sessions} onSelect={select} />
        <div className="planning-week-actions">
          {data.goal ? canPlan && <>
            {report && <p className="px-1 text-footnote text-label-2">Le coach tiendra compte du bilan que tu viens d’ouvrir.</p>}
            <Button onClick={() => setSheet('setup')}><CoachIcon size={19} aria-hidden />
              {data.plan ? 'Adapter avec le coach' : 'Préparer avec le coach'}
            </Button>
            {draft && <Button variant="gray" size="md" onClick={() => setSheet('review')}>Relire la proposition</Button>}
          </> : <Group><Row leading={<Tile><Target size={18} aria-hidden /></Tile>} title="Définir mon objectif"
            subtitle="Choisis ce que le coach doit t’aider à atteindre." href={href.today} /></Group>}
        </div>
      </div>
      {notice && <p role="status" className="mb-4 text-subhead text-green">{notice}</p>}
      <div className="planning-week-layout">
        <section className="min-w-0" aria-label="Séances de la semaine">
          <div className="planning-agenda-head">
            <h2 className="text-title2">{currentWeek ? 'Cette semaine' : 'Séances de la semaine'}</h2>
            {sessions.length > 0 && <p className="text-footnote text-label-2">{closed} avec bilan sur {sessions.length}
              {missed > 0 && ` · ${missed} manquée${missed > 1 ? 's' : ''}`}</p>}
          </div>
          {picked && days.includes(picked) && sessions.length > 0 && !sessions.some(item => item.day === picked) &&
            <p role="status" className="mb-3 rounded-xl bg-surface px-3.5 py-3 text-subhead text-label-2">
              Aucune séance prévue le {dayText(picked, true)}.
            </p>}
          {sessions.length ? <div className="grid gap-2">
            {sessions.map(item => <SessionRow key={item.id} entry={item} profile={profile} today={data.today}
              selected={item.day === selected} log={() => setEntry(item)} />)}
          </div> : <Group><Row leading={<Tile color="var(--color-label-2)"><CalendarDays size={18} aria-hidden /></Tile>}
            title={data.plan ? 'Semaine sans séance prévue' : 'Semaine à préparer'} /></Group>}
        </section>
        {data.goal && <section className="grid min-w-0 content-start gap-3" aria-label="Objectif et préparation">
          <h2 className="text-title2">Mon objectif</h2>
            <Group><Row leading={<Tile><Target size={18} aria-hidden /></Tile>} title={data.goal.description}
              subtitle={data.goal.target_date ? `${data.goal.milestone} · ${dayText(data.goal.target_date)}` : data.goal.milestone} /></Group>
            {data.plan && <>
              <Disclosure title="Le conseil du coach">
                <div className="px-4 pb-4">
                  <h3 className="text-headline wrap-anywhere">{data.plan.focus}</h3>
                  <p className="mt-1 text-subhead leading-relaxed text-label-2 wrap-anywhere">{data.plan.explanation}</p>
                </div>
              </Disclosure>
              <Phases phases={data.plan.phases} />
              {data.plan.goal_revision !== data.goal.revision && <p className="text-footnote text-orange">Ton objectif a changé. Le coach peut adapter cette semaine.</p>}
            </>}
        </section>}
      </div>
      {sheet === 'setup' && <SetupSheet data={{ ...data, proposal: draft ?? null }} profile={profile} report={report}
        close={close} receive={value => { setReceived(value); setSheet(current => current === 'setup' ? 'review' : current) }} />}
      {sheet === 'review' && draft && <ReviewSheet data={data} draft={draft} profile={profile} close={close}
        change={() => setSheet('setup')} saved={value => saved(value, 'Semaine enregistrée.')} />}
      {entry && <OutdoorSheet data={data} entry={entry} profile={profile} close={close}
        saved={value => saved(value, 'Bilan de la sortie enregistré.')} />}
    </>}
  </>
}

export function Planning(props: { profile: string; week?: string; day?: string; report?: string; view?: 'month'; month?: string }) {
  return <Page title="Planning" back={props.report ? { label: 'Bilan', href: href.report(props.report) } : undefined}>
    <div className="planning-page">
      {props.view === 'month' ? <MonthPlanning profile={props.profile} month={props.month} day={props.day} /> : <WeekPlanning {...props} />}
    </div>
  </Page>
}
