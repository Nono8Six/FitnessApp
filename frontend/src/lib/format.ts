const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dec1 = (v: number) => nf1.format(v)
export const dec2 = (v: number) => nf2.format(v)

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
