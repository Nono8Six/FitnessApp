import { CalendarDays, Pencil, Target } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CoachIcon } from '../components/Icons'
import { Button, Group, Row, SectionHeader, Sheet, Skeleton, Tile } from '../components/ui'
import { WorkoutError } from '../components/WorkoutSummary'
import { ApiError, errorMessage } from '../lib/api'
import { readGoal, saveGoal, suggestGoal, type GoalAdvice, type TrainingGoal } from '../lib/goals'
import { href } from '../lib/router'

const dateLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })
const fieldClass = 'block min-h-12 w-full min-w-0 rounded-[12px] bg-surface-2 px-3.5 py-3 text-[16px] leading-snug text-label placeholder:text-label-3 disabled:text-label-2'
const labelClass = 'mb-2 block text-subhead font-semibold text-label'

function GoalEditor({ profile, goal, close, saved, reload }: {
  profile: string
  goal: TrainingGoal | null
  close: () => void
  saved: (goal: TrainingGoal) => void
  reload: () => void
}) {
  const id = useId()
  const [description, setDescription] = useState(goal?.description ?? '')
  const [milestone, setMilestone] = useState(goal?.milestone ?? '')
  const [date, setDate] = useState(goal?.target_date ?? '')
  const [advice, setAdvice] = useState<GoalAdvice>()
  const [clarification, setClarification] = useState('')
  const [pending, setPending] = useState<'advice' | 'save'>()
  const [error, setError] = useState('')
  const [adviceError, setAdviceError] = useState('')
  const [conflict, setConflict] = useState(false)
  const milestoneField = useRef<HTMLTextAreaElement>(null)
  const clarificationField = useRef<HTMLInputElement>(null)
  const draft = { description: description.trim(), target_date: date || null }
  const dirty = !goal || draft.description !== goal.description || milestone.trim() !== goal.milestone
    || draft.target_date !== goal.target_date

  useEffect(() => {
    if (advice) (advice.question ? clarificationField : milestoneField).current?.focus()
  }, [advice])

  const resetAdvice = () => {
    setAdvice(undefined)
    setClarification('')
    setAdviceError('')
  }
  const askCoach = async () => {
    if (pending || !draft.description) return
    setPending('advice')
    setAdviceError('')
    try {
      const answer = clarification.trim()
      const result = await suggestGoal(profile, {
        ...draft,
        ...(advice?.question && answer ? { clarification: `${advice.question}\n${answer}` } : {}),
      })
      setAdvice(result)
      setMilestone(result.milestone)
      setClarification('')
    } catch (err) {
      setAdviceError(errorMessage(err))
    } finally { setPending(undefined) }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const repere = milestone.trim()
    if (pending || conflict || !dirty || !draft.description || !repere) return
    setPending('save')
    setError('')
    try {
      saved(await saveGoal(profile, { ...draft, milestone: repere, revision: goal?.revision ?? 0 }))
    } catch (err) {
      setConflict(err instanceof ApiError && err.status === 409)
      setError(errorMessage(err))
    } finally { setPending(undefined) }
  }

  return <Sheet open title={goal ? 'Modifier mon objectif' : 'Définir mon objectif'}
    onClose={() => { if (pending !== 'save') close() }} footer={
      <Button form={id} type="submit" className="w-full"
        disabled={!!pending || conflict || !dirty || !draft.description || !milestone.trim()}>
        {pending === 'save' ? 'Enregistrement…' : 'Enregistrer l’objectif'}
      </Button>
    }>
    <form id={id} onSubmit={submit}>
      <fieldset disabled={!!pending} className="grid min-w-0 gap-5">
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Qu’aimerais-tu accomplir ?</label>
          <textarea id={`${id}-description`} name="description" rows={2} maxLength={240} required
            className={`${fieldClass} resize-y`} placeholder="Par exemple, retrouver un rythme régulier."
            value={description} onChange={event => { setDescription(event.target.value); resetAdvice() }} />
        </div>
        <div>
          <label htmlFor={`${id}-date`} className={labelClass}>
            Échéance <span className="ml-1 font-normal text-label-2">(facultative)</span>
          </label>
          <input id={`${id}-date`} name="target_date" type="date" max="9999-12-31"
            className={`${fieldClass} max-w-full appearance-none`}
            defaultValue={goal?.target_date ?? ''} onInput={event => { setDate(event.currentTarget.value); resetAdvice() }} />
        </div>
        <div className="border-t border-sep pt-4">
          <label htmlFor={`${id}-milestone`} className={labelClass}>Repère de progression</label>
          <textarea ref={milestoneField} id={`${id}-milestone`} name="milestone" rows={2} maxLength={160} required
            className={`${fieldClass} resize-y`} placeholder="Par exemple, deux séances par semaine."
            value={milestone} onChange={event => setMilestone(event.target.value)} />
          {advice && <p role="status" className="mt-2 text-footnote text-label-2">
            {milestone === advice.milestone ? 'Repère proposé par le coach. Tu peux le modifier.' : 'Repère modifié.'}
          </p>}
          {advice?.question && <div className="mt-4 rounded-[12px] bg-surface-2 p-3.5">
            <label htmlFor={`${id}-clarification`} className={`${labelClass} wrap-anywhere`}>{advice.question}</label>
            <input ref={clarificationField} id={`${id}-clarification`} maxLength={180} value={clarification}
              className={`${fieldClass} bg-fill-3`} placeholder="Ta précision"
              onChange={event => setClarification(event.target.value)} />
          </div>}
          <Button type="button" size="md" variant="gray" className="mt-3 max-w-full"
            disabled={!draft.description || !!advice?.question && !clarification.trim()} onClick={() => void askCoach()}>
            <CoachIcon size={17} aria-hidden />
            {pending === 'advice' ? 'Le coach prépare le repère…' : advice?.question ? 'Affiner le repère' : 'Demander au coach'}
          </Button>
          {pending === 'advice' && <span role="status" className="sr-only">Le coach prépare le repère.</span>}
          {adviceError && <p role="alert" className="mt-3 text-footnote text-red">{adviceError}</p>}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-footnote text-red">{error}</p>}
      {conflict && <Button type="button" size="md" variant="plain" onClick={reload}>Recharger l’objectif</Button>}
    </form>
  </Sheet>
}

export function TodayGoal({ profile }: { profile: string }) {
  const [goal, setGoal] = useState<TrainingGoal | null>()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let current = true
    readGoal(profile).then(value => { if (current) setGoal(value) })
      .catch(err => { if (current) setError(errorMessage(err)) })
    return () => { current = false }
  }, [profile, attempt])

  const reload = () => {
    setEditing(false)
    setError('')
    setGoal(undefined)
    setAttempt(value => value + 1)
  }

  return <section aria-label="Mon objectif">
    <SectionHeader title="Mon objectif" />
    {error ? <WorkoutError message={error} retry={reload} />
      : goal === undefined ? <Skeleton label="Chargement de l’objectif" />
      : <Group>
        <Row leading={<Tile><Target size={18} aria-hidden /></Tile>}
          title={goal ? <span className="font-semibold">{goal.description}</span> : 'Définir mon objectif'}
          subtitle={goal ? <div className="wrap-anywhere">
            <p>{goal.milestone}</p>
            {goal.target_date && <p className="mt-1 flex items-center gap-1.5">
              <CalendarDays size={14} className="shrink-0" aria-hidden />
              <time dateTime={goal.target_date}>{dateLabel.format(new Date(goal.target_date))}</time>
            </p>}
          </div> : 'Le coach s’en servira pour te suivre.'}
          onClick={() => setEditing(true)}
          trailing={goal && <Pencil size={17} aria-hidden />}
          chevron={!goal} />
        {goal && <Row leading={<Tile color="var(--color-speed)"><CoachIcon size={17} aria-hidden /></Tile>}
          title="Faire le point avec le coach" href={href.coachProgress} />}
      </Group>}
    <span role="status" className="sr-only">{notice}</span>
    {editing && goal !== undefined && <GoalEditor profile={profile} goal={goal} close={() => setEditing(false)}
      reload={reload} saved={value => { setGoal(value); setEditing(false); setNotice('Objectif enregistré.') }} />}
  </section>
}
