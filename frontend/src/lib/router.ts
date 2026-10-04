import { useEffect, useState } from 'react'

/** Les routes apparaissent avec la brique qui construit leur écran. */
export type Route = { name: 'today' } | { name: 'settings' }

export function parse(hash: string): Route {
  if (hash === href.settings) return { name: 'settings' }
  return { name: 'today' }
}

export const href = {
  today: '#/',
  settings: '#/reglages',
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
