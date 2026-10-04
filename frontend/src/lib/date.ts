import { useEffect, useState } from 'react'

const TZ = 'Europe/Paris'
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })

export const formatLongDay = (d: Date) => longDay.format(d)

/** Date du jour à Paris, actualisée au passage de minuit et au retour sur l’onglet. */
export function useToday() {
  const [label, setLabel] = useState(() => formatLongDay(new Date()))
  useEffect(() => {
    const refresh = () => setLabel(formatLongDay(new Date()))
    const id = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return label
}
