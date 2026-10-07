import { api, isRecord } from './api'
import { isWorkout, type Workout } from './workouts'
import type { LiveSample } from './execution'

export interface RecordedBrief {
  id: string; name: string; started_at: string; mode: 'reel' | 'simulation'; phase: string
  active_s: number; feeling: number | null; closed: boolean
}
export interface RecordedEvent { t: number; at: string; kind: string; data: Record<string, unknown> }
interface BlockResult { active_s: number; speed_avg: number | null; incline_avg: number | null; speed_coverage: number | null; incline_coverage: number | null }
export interface Recording extends RecordedBrief {
  profile: { id: string; name: string; weight_kg: number | null }; workout: Workout
  checkpoint: { active_s: number; pause_s: number; wall_s: number; phase: string; reason: string | null; stop_confirmed: boolean }
  calculation_version: string; persisted_at: string; persisted_seq: number; lost_entries: number; raw_count: number
  feeling_updated_at: string | null; samples: (LiveSample & { block_index: number; applied_speed: number | null; applied_incline: number | null })[]; events: RecordedEvent[]
  metrics: {
    version: string; active_s: number; pause_s: number; wall_s: number
    distance_m: number | null; distance_quality: 'absent' | 'partial' | 'complete'; distance_coverage: number | null
    speed_avg: number | null; incline_avg: number | null
    coverage: { speed: number | null; incline: number | null; energy: number | null }
    valid_s: { speed: number; incline: number; energy: number }
    energy: { active_kcal: number | null; total_kcal: number | null; weight_kg: number | null; outside_range: boolean }
    blocks: BlockResult[]
  }
}
export interface RecordingList { items: RecordedBrief[]; next: string | null }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optionalNumber = (v: unknown) => v === null || finite(v)
function isBrief(v: unknown): v is RecordedBrief {
  return isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.started_at === 'string'
    && ['reel', 'simulation'].includes(String(v.mode)) && typeof v.phase === 'string' && finite(v.active_s)
    && optionalNumber(v.feeling) && typeof v.closed === 'boolean'
}
function isRecording(v: unknown): v is Recording {
  if (!isBrief(v) || !isRecord(v) || !isWorkout(v.workout) || !isRecord(v.profile) || !isRecord(v.checkpoint) || !isRecord(v.metrics)) return false
  const m = v.metrics
  const checkpoint = v.checkpoint, coverage = m.coverage, valid = m.valid_s, energy = m.energy
  return typeof v.profile.id === 'string' && typeof v.profile.name === 'string' && optionalNumber(v.profile.weight_kg)
    && typeof v.persisted_at === 'string' && finite(v.persisted_seq) && finite(v.lost_entries) && finite(v.raw_count)
    && typeof v.calculation_version === 'string' && (v.feeling_updated_at === null || typeof v.feeling_updated_at === 'string')
    && ['active_s', 'pause_s', 'wall_s'].every(k => finite(checkpoint[k]) && finite(m[k]))
    && typeof v.checkpoint.stop_confirmed === 'boolean' && (v.checkpoint.reason === null || typeof v.checkpoint.reason === 'string')
    && ['speed_avg', 'incline_avg', 'distance_m', 'distance_coverage'].every(k => optionalNumber(m[k]))
    && ['absent', 'partial', 'complete'].includes(String(m.distance_quality)) && typeof m.version === 'string'
    && isRecord(coverage) && ['speed', 'incline', 'energy'].every(k => optionalNumber(coverage[k]))
    && isRecord(valid) && ['speed', 'incline', 'energy'].every(k => finite(valid[k]))
    && isRecord(energy) && ['active_kcal', 'total_kcal', 'weight_kg'].every(k => optionalNumber(energy[k])) && typeof energy.outside_range === 'boolean'
    && Array.isArray(m.blocks) && m.blocks.length === v.workout.blocks.length && m.blocks.every(b => isRecord(b) && finite(b.active_s)
      && ['speed_avg', 'incline_avg', 'speed_coverage', 'incline_coverage'].every(k => optionalNumber(b[k])))
    && Array.isArray(v.samples) && v.samples.every(s => isRecord(s) && finite(s.t) && finite(s.active_s) && finite(s.seq)
      && finite(s.target) && finite(s.target_incline) && finite(s.block_index) && optionalNumber(s.applied_speed) && optionalNumber(s.applied_incline)
      && optionalNumber(s.speed) && optionalNumber(s.incline) && typeof s.phase === 'string')
    && Array.isArray(v.events) && v.events.every(e => isRecord(e) && finite(e.t) && typeof e.at === 'string' && typeof e.kind === 'string' && isRecord(e.data))
}
const path = (profile: string) => `/api/profiles/${encodeURIComponent(profile)}/recordings`
export const readRecording = (profile: string, id: string) => api(`${path(profile)}/${encodeURIComponent(id)}`, { validate: isRecording, timeout: 15000 })
export const readRecordings = (profile: string, after?: string, workout?: string) => {
  const q = new URLSearchParams()
  if (after) q.set('after', after)
  if (workout) q.set('workout_id', workout)
  return api(`${path(profile)}?${q}`, { validate: (v): v is RecordingList => isRecord(v) && Array.isArray(v.items) && v.items.every(isBrief) && (v.next === null || typeof v.next === 'string') })
}
export const saveFeeling = (profile: string, id: string, feeling: number | null) => api(`${path(profile)}/${encodeURIComponent(id)}/feeling`, {
  method: 'PATCH', body: { feeling }, validate: (v): v is { feeling: number | null; updated_at: string } => isRecord(v) && optionalNumber(v.feeling) && typeof v.updated_at === 'string',
})
export const recordingLabel = (phase: string) => ({ completed: 'Terminée', stopped: 'Arrêtée avant la fin', cancelled: 'Départ annulé', interrupted: 'Interrompue', unknown: 'Arrêt non confirmé' }[phase] ?? 'En cours')
export const recordingDate = (at: string) => new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
