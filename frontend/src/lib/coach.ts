import { api, ApiError, isRecord } from './api'
import { isPreview, isWorkout, isWorkoutInput, type Preview, type Workout, type WorkoutInput } from './workouts'

export interface WorkoutTarget { workout_id: string; version: number }
export interface WorkoutProposal {
  id: string; turn_id: string; conversation_id: string; explanation: string; status: 'pending' | 'accepted' | 'ignored'
  accepted_id: string | null; accepted_version: number | null; workout: WorkoutInput & Preview; base: Workout | null
}
const isWorkoutProposal = (v: unknown): v is WorkoutProposal => isRecord(v) && typeof v.id === 'string'
  && typeof v.turn_id === 'string' && typeof v.conversation_id === 'string' && typeof v.explanation === 'string'
  && ['pending', 'accepted', 'ignored'].includes(String(v.status)) && (v.accepted_id === null || typeof v.accepted_id === 'string')
  && (v.accepted_version === null || Number.isInteger(v.accepted_version)) && isWorkoutInput(v.workout) && isPreview(v.workout)
  && (v.base === null || isWorkout(v.base))

export interface Conversation { id: string; title: string; created_at: string; updated_at: string; archived_at: string | null }
export interface Source { id: string; version: number; name: string; href: string }
export interface Proposal { content: string; quote: string; saved_memory_id?: string | null }
export interface Turn {
  id: string; conversation_id: string; request_id: string; user_text: string; answer: string
  status: 'running' | 'completed' | 'interrupted' | 'failed'; error: string | null; error_message: string | null
  model: string | null; sources: Source[]; proposals: Proposal[]; created_at: string; updated_at: string
  workout_proposals: WorkoutProposal[]
  usage: { requests: number; reports: { input_tokens: number | null; output_tokens: number | null; cached_input_tokens: number | null }[] }
}
export interface Memory { id: string; content: string; source_turn_id: string | null; proposal_index: number | null; created_at: string; updated_at: string }
export interface PageData<T> { items: T[]; total: number; next_offset: number | null; partial: boolean }

const dates = (v: Record<string, unknown>) => typeof v.created_at === 'string' && typeof v.updated_at === 'string'
const nullableText = (v: unknown) => v === null || typeof v === 'string'
const isConversation = (v: unknown): v is Conversation => isRecord(v) && typeof v.id === 'string' && typeof v.title === 'string' && dates(v)
  && nullableText(v.archived_at)
const isSource = (v: unknown): v is Source => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
  && Number.isInteger(v.version) && typeof v.href === 'string' && /^#\/seances\/[a-f0-9]{32}\?version=\d+$/.test(v.href)
export const isTurn = (v: unknown): v is Turn => isRecord(v) && typeof v.id === 'string' && typeof v.conversation_id === 'string'
  && typeof v.request_id === 'string' && typeof v.user_text === 'string' && typeof v.answer === 'string'
  && ['running', 'completed', 'interrupted', 'failed'].includes(String(v.status)) && nullableText(v.error) && nullableText(v.model)
  && (v.error_message === undefined || nullableText(v.error_message)) && dates(v)
  && Array.isArray(v.sources) && v.sources.every(isSource) && Array.isArray(v.proposals)
  && v.proposals.every(p => isRecord(p) && typeof p.content === 'string' && typeof p.quote === 'string')
  && Array.isArray(v.workout_proposals) && v.workout_proposals.every(isWorkoutProposal)
  && isRecord(v.usage) && Number.isInteger(v.usage.requests) && Array.isArray(v.usage.reports)
  && v.usage.reports.every(r => isRecord(r) && ['input_tokens', 'output_tokens', 'cached_input_tokens'].every(k => r[k] === null || Number.isInteger(r[k])))
const isMemory = (v: unknown): v is Memory => isRecord(v) && typeof v.id === 'string' && typeof v.content === 'string'
  && nullableText(v.source_turn_id) && (v.proposal_index === null || Number.isInteger(v.proposal_index)) && dates(v)
const pageOf = <T,>(valid: (v: unknown) => v is T) => (v: unknown): v is PageData<T> => isRecord(v)
  && Array.isArray(v.items) && v.items.every(valid) && Number.isInteger(v.total)
  && (v.next_offset === null || Number.isInteger(v.next_offset)) && typeof v.partial === 'boolean'
export const coachUrl = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/coach`
export const readWorkoutProposal = (profile: string, id: string) => api(`${coachUrl(profile)}/workout-proposals/${id}`, { validate: isWorkoutProposal })
export const acceptWorkoutProposal = (profile: string, id: string, edited?: WorkoutInput) => api(`${coachUrl(profile)}/workout-proposals/${id}/accept`, {
  method: 'POST', body: edited ? { edited_workout: edited } : {}, validate: isWorkout,
})
export const ignoreWorkoutProposal = (profile: string, id: string) => api(`${coachUrl(profile)}/workout-proposals/${id}/ignore`, { method: 'POST', validate: isWorkoutProposal })
export const readConversations = (profile: string, query = '', offset = 0, archived = false) => api(
  `${coachUrl(profile)}/conversations?${new URLSearchParams({ query, offset: String(offset), archived: String(archived) })}`, { validate: pageOf(isConversation) })
/** Archiver retire la conversation de la liste ; ses échanges restent lisibles et un nouveau message la ramène. */
export const archiveConversation = (profile: string, id: string, archived: boolean) => api(`${coachUrl(profile)}/conversations/${id}`, {
  method: 'PATCH', body: { archived }, validate: isConversation })
export const createConversation = (profile: string) => api(`${coachUrl(profile)}/conversations`, { method: 'POST', validate: isConversation })
export const readTurns = (profile: string, id: string, offset = 0) => api(`${coachUrl(profile)}/conversations/${id}?offset=${offset}`, {
  validate: (v): v is PageData<Turn> & { conversation: Conversation } => pageOf(isTurn)(v) && isRecord(v) && isConversation(v.conversation),
})
export const stopTurn = (profile: string, id: string) => api(`${coachUrl(profile)}/messages/${id}/stop`, { method: 'POST',
  validate: (v): v is { stopped: true } => isRecord(v) && v.stopped === true })
export const readMemories = (profile: string, offset = 0) => api(`${coachUrl(profile)}/memories?offset=${offset}`, { validate: pageOf(isMemory) })
export const saveMemory = (profile: string, content: string, id?: string, source?: { source_turn_id: string; proposal_index: number }) =>
  api(`${coachUrl(profile)}/memories${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: { content, ...source }, validate: isMemory })
export const deleteMemory = (profile: string, id: string) => api(`${coachUrl(profile)}/memories/${id}`, { method: 'DELETE',
  validate: (v): v is { deleted: true } => isRecord(v) && v.deleted === true })

/** Aucune répétition automatique. La même clé est conservée si l'accusé de réception a été perdu. */
export async function sendMessage(profile: string, conversation: string, text: string, requestId: string,
  signal: AbortSignal, onTurn: (turn: Turn) => void, target?: WorkoutTarget) {
  const path = `${coachUrl(profile)}/conversations/${conversation}/messages`
  const response = await fetch(path, { method: 'POST', signal, cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ text, request_id: requestId, workout_target: target }) })
  if (!response.ok || !response.body) {
    let message = 'Le serveur n’a pas accepté le message. Votre saisie est conservée.'
    try { const body: unknown = await response.json(); if (isRecord(body) && typeof body.detail === 'string' && body.detail.length < 220) message = body.detail } catch { /* Réponse sans JSON. */ }
    throw new ApiError('http', message, response.status, { label: path })
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', received = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      if (buffer.length > 2_000_000) throw new Error('Flux invalide')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const turn: unknown = JSON.parse(data)
        if (!isTurn(turn)) throw new Error('Réponse invalide')
        received = true; onTurn(turn)
      }
    }
    if (!received) throw new Error('Réponse absente')
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
