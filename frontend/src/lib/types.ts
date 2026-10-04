/** Types partagés par les graphiques et les écrans d'entraînement. */

export type BlockKind = 'warmup' | 'run' | 'recover' | 'steady' | 'cooldown'

export interface Block {
  index: number
  kind: BlockKind
  label: string
  sec: number
  speed: number
  incline: number
  start: number
  end: number
}

export interface Sample {
  t: number
  target: number
  speed: number | null
  incline: number | null
}
