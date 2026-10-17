const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dec1 = (v: number) => nf1.format(v)
export const dec2 = (v: number) => nf2.format(v)

export interface CalorieEstimate {
  active_kcal: number | null
  total_kcal?: number | null
  movement_ambiguous?: boolean
  active_kcal_low?: number | null
  active_kcal_high?: number | null
  total_kcal_low?: number | null
  total_kcal_high?: number | null
}

/** Deux scénarios marche/course restent visibles lorsqu'aucune valeur unique n'est justifiée. */
export function calories(energy: CalorieEstimate, total = false): string | null {
  const value = total ? energy.total_kcal : energy.active_kcal
  if (value != null) return `≈ ${Math.round(value)}`
  const low = total ? energy.total_kcal_low : energy.active_kcal_low
  const high = total ? energy.total_kcal_high : energy.active_kcal_high
  return energy.movement_ambiguous && low != null && high != null
    ? `≈ ${Math.round(low)}–${Math.round(high)}` : null
}

/** 1044 -> "17:24", 3725 -> "1:02:05" */
export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Pace in min/km from km/h, e.g. 7.9 -> "7′36″". */
export function pace(kmh: number) {
  if (!(kmh > 0)) return '--'
  const secPerKm = Math.round(3600 / kmh)
  return `${Math.floor(secPerKm / 60)}′${String(secPerKm % 60).padStart(2, '0')}″`
}

export function minutes(totalSeconds: number) {
  return `${Math.round(totalSeconds / 60)} min`
}
