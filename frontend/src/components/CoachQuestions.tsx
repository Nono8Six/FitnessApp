import { ArrowUp, Check, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { Button, Chip, cx } from './ui'
import type { Question } from '../lib/coach'

type Answer = { choice?: string; other?: string }
const chip = 'h-auto min-h-9 py-1.5 text-left whitespace-normal'

/**
 * Questions du coach en capsules, comme les filtres d'Apple Fitness : un choix par question, « Autre » pour
 * préciser. Les réponses partent en un seul message lisible ; la saisie libre reste toujours possible.
 */
export function CoachQuestions({ questions, onSubmit, disabled }: {
  questions: Question[]
  /** Absent : questions d'un échange passé, affichées pour mémoire. */
  onSubmit?: (text: string) => void
  disabled?: boolean
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({})))
  const interactive = !!onSubmit
  const value = (a: Answer) => a.other !== undefined ? a.other.trim() : a.choice ?? ''
  const answered = answers.filter(a => value(a)).length
  const set = (index: number, next: Answer) => setAnswers(old => old.map((a, i) => i === index ? next : a))
  const submit = () => {
    if (!onSubmit || !answered || disabled) return
    onSubmit(questions.map((q, i) => value(answers[i]) ? `${q.label} : ${value(answers[i])}` : '').filter(Boolean).join('\n'))
  }

  return <section aria-label="Questions du coach" className={cx('mt-4 rounded-[16px] bg-surface p-4', !interactive && 'opacity-70')}>
    <div className="grid gap-5">
      {questions.map((q, index) => {
        const a = answers[index]
        return <fieldset key={index} disabled={!interactive || disabled} className="min-w-0">
          <legend className="flex items-center gap-2 text-subhead font-semibold">
            <span className={cx('grid size-5 shrink-0 place-items-center rounded-full text-caption2 font-bold',
              value(a) ? 'bg-accent text-on-accent' : 'bg-fill-3 text-label-2')}>
              {value(a) ? <Check size={12} strokeWidth={3.2} /> : index + 1}
            </span>
            {q.label}
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {q.options.map(option => <Chip key={option} className={chip} selected={a.other === undefined && a.choice === option}
              onClick={() => set(index, { choice: option })}>{option}</Chip>)}
            {interactive && <Chip className={chip} selected={a.other !== undefined}
              onClick={() => set(index, a.other !== undefined ? {} : { other: '' })}><PencilLine size={14} />Autre</Chip>}
          </div>
          {a.other !== undefined && <input autoFocus value={a.other} maxLength={200} aria-label={`${q.label} : votre réponse`}
            placeholder="Précise ta réponse" onChange={e => set(index, { other: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
            className="mt-2.5 h-10 w-full rounded-full bg-fill-3 px-4 text-subhead outline-none placeholder:text-label-3 focus-visible:shadow-[inset_0_0_0_1px_var(--color-label-3)]" />}
        </fieldset>
      })}
    </div>
    {interactive && <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-footnote text-label-2">{answered}/{questions.length} · ou réponds librement dans la saisie</p>
      <Button size="md" disabled={!answered || disabled} onClick={submit}>Envoyer<ArrowUp size={17} strokeWidth={2.6} /></Button>
    </div>}
  </section>
}
