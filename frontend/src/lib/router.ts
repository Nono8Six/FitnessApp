import { useEffect, useState } from 'react'

/** Les routes apparaissent avec la brique qui construit leur écran. */
export type Route = { name: 'today' } | { name: 'settings' } | { name: 'coach' } | { name: 'library' } | { name: 'editor'; id?: string } | { name: 'workout'; id: string; version?: number }

export function parse(hash: string): Route {
  if (hash === href.settings) return { name: 'settings' }
  if (hash === href.library) return { name: 'library' }
  if (hash === href.coach) return { name: 'coach' }
  if (hash === href.newWorkout) return { name: 'editor' }
  const match = /^#\/seances\/([a-f0-9]{32})(\/modifier)?(?:\?version=([1-9]\d*))?$/.exec(hash)
  if (match) return match[2] ? { name: 'editor', id: match[1] } : { name: 'workout', id: match[1], version: match[3] ? Number(match[3]) : undefined }
  return { name: 'today' }
}

export const href = {
  today: '#/',
  settings: '#/reglages',
  coach: '#/coach',
  library: '#/seances',
  newWorkout: '#/seances/nouvelle',
  workout: (id: string) => `#/seances/${id}`,
  editWorkout: (id: string) => `#/seances/${id}/modifier`,
}

export function navigate(to: string) {
  if (location.hash !== to) location.hash = to
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
