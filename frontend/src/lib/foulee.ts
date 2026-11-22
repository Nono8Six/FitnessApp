import { isRecord } from './api'
import type { Step, WorkoutInput } from './workouts'

type FouleeBlock = Omit<Step, 'speed'> & { speed: number | null }

export interface FouleeWorkout {
  name: string
  blocks: FouleeBlock[]
  missingSpeeds: number
}

const MIN_SPEED = 1
const MAX_SPEED = 16
export const FOULEE_SPEED_RANGE = `Entre ${MIN_SPEED} et ${MAX_SPEED} km/h.`

const validSpeed = (value: unknown): value is number =>
  typeof value === 'number' && value >= MIN_SPEED && value <= MAX_SPEED

export function fouleeRunningSpeed(text: string): number | null {
  const value = text.trim()
  if (!/^\d+(?:[,.]\d+)?$/.test(value)) return null
  const speed = Number(value.replace(',', '.'))
  return validSpeed(speed) ? speed : null
}

function readBlock(value: unknown, index: number): FouleeBlock {
  const block = `Bloc ${index + 1}`
  if (!isRecord(value) || typeof value.action !== 'string' || !value.action.trim()) {
    throw new Error(`${block} · type de bloc manquant.`)
  }
  const { duration_seconds: sec, speed_kmh: speed, incline_percent: incline } = value
  if (typeof sec !== 'number' || !Number.isInteger(sec) || sec < 30 || sec > 3600) {
    throw new Error(`${block} · la durée doit être comprise entre 30 secondes et 60 minutes.`)
  }
  if (typeof incline !== 'number' || !Number.isFinite(incline) || incline < 0 || incline > 10) {
    throw new Error(`${block} · la pente doit être comprise entre 0 et 10 %.`)
  }
  const label = value.action.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const walk = /\bmarche\b/.test(label)
  const run = /\b(course|footing|jogging)\b/.test(label)
  const movement = walk === run ? null : walk ? 'walk' : 'run'
  let kind: Step['kind'] = 'steady'
  if (/\b(echauffement|marche active)\b/.test(label)) kind = 'warmup'
  else if (/\bretour au calme\b/.test(label)) kind = 'cooldown'
  else if (/\brecuperation\b/.test(label) || label === 'marche') kind = 'recover'
  else if (movement === 'run') kind = 'run'

  if (speed == null && movement === 'run') return { kind, movement, sec, incline, speed: null }
  if (!validSpeed(speed)) throw new Error(`${block} · ${speed == null ? 'vitesse manquante.' : FOULEE_SPEED_RANGE}`)
  return { kind, movement, sec, incline, speed }
}

export function readFouleeWorkout(text: string): FouleeWorkout {
  let value: unknown
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('Ce fichier JSON est illisible. Exportez de nouveau les blocs depuis Foulée.')
  }
  if (!isRecord(value) || value.format !== 'foulee.treadmill.v1') {
    throw new Error('Dans Foulée, ouvrez la séance et choisissez « Exporter les blocs JSON ».')
  }
  const name = typeof value.title === 'string' ? value.title.trim().normalize('NFC') : ''
  if (!name || [...name].length > 80 || /\p{C}/u.test(name)) {
    throw new Error('Le fichier doit contenir un nom de séance valide de 80 caractères maximum.')
  }
  if (!Array.isArray(value.blocks) || !value.blocks.length || value.blocks.length > 120) {
    throw new Error('Une séance doit contenir entre 1 et 120 blocs.')
  }
  const blocks = value.blocks.map(readBlock)
  return { name, blocks, missingSpeeds: blocks.filter(block => block.speed === null).length }
}

export function fouleeDraft(workout: FouleeWorkout, runningSpeed: number | null): WorkoutInput {
  return {
    name: workout.name,
    items: workout.blocks.map(block => {
      const speed = block.speed ?? runningSpeed
      if (!validSpeed(speed)) throw new Error(FOULEE_SPEED_RANGE)
      return { ...block, speed }
    }),
  }
}
