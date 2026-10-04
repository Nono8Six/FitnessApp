import { useEffect, useState } from 'react'

export type Route =
  | { name: 'today' }
  | { name: 'library' }
  | { name: 'editor'; id?: string }
  | { name: 'history' }
  | { name: 'session'; id: string }
  | { name: 'coach' }
  | { name: 'live' }

export function parse(hash: string): Route {
  const [path] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  switch (parts[0]) {
    case 'seances':
      if (parts[1] === 'nouvelle') return { name: 'editor' }
      if (parts[1]) return { name: 'editor', id: parts[1] }
      return { name: 'library' }
    case 'historique':
      return parts[1] ? { name: 'session', id: parts[1] } : { name: 'history' }
    case 'coach':
      return { name: 'coach' }
    case 'direct':
      return { name: 'live' }
    default:
      return { name: 'today' }
  }
}

export const href = {
  today: '#/',
  library: '#/seances',
  newProgramme: '#/seances/nouvelle',
  programme: (id: string) => `#/seances/${id}`,
  history: '#/historique',
  session: (id: string) => `#/historique/${id}`,
  coach: '#/coach',
  live: '#/direct',
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

/** Review scenarios, e.g. ?scenario=live. Not exposed in the UI. */
export function scenario(): string | null {
  return new URLSearchParams(location.search).get('scenario')
}
