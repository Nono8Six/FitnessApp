import { useEffect, useState } from 'react'

/** Les routes apparaissent avec la brique qui construit leur écran. */
export type Route = { name: 'today' } | { name: 'settings'; treadmill?: boolean } | { name: 'direct' }
  | { name: 'coach'; conversationId?: string; target?: { workout_id: string; version: number }; createWorkout?: boolean }
  | { name: 'library'; view?: 'discover' | 'mine' } | { name: 'editor'; id?: string; proposalId?: string }
  | { name: 'workout'; id: string; version?: number }
  | { name: 'recordings'; workoutId?: string } | { name: 'report'; id: string }

export function parse(hash: string): Route {
  if (hash === href.recordings) return { name: 'recordings' }
  const reports = /^#\/bilans\?seance=([a-f0-9]{32})$/.exec(hash)
  if (reports) return { name: 'recordings', workoutId: reports[1] }
  const report = /^#\/bilans\/([a-f0-9]{32})$/.exec(hash)
  if (report) return { name: 'report', id: report[1] }
  if (hash === href.settings) return { name: 'settings' }
  if (hash === href.treadmill) return { name: 'settings', treadmill: true }
  if (hash === href.direct) return { name: 'direct' }
  if (hash === href.library) return { name: 'library' }
  if (hash === href.myWorkouts) return { name: 'library', view: 'mine' }
  if (hash === href.coach) return { name: 'coach' }
  if (hash === href.coachCreate) return { name: 'coach', createWorkout: true }
  const coach = /^#\/coach\?conversation=([a-f0-9]{32})$/.exec(hash)
  if (coach) return { name: 'coach', conversationId: coach[1] }
  const adjust = /^#\/coach\?workout=([a-f0-9]{32})&version=([1-9]\d*)$/.exec(hash)
  if (adjust) return { name: 'coach', target: { workout_id: adjust[1], version: Number(adjust[2]) } }
  const proposal = /^#\/propositions\/([a-f0-9]{32})\/modifier$/.exec(hash)
  if (proposal) return { name: 'editor', proposalId: proposal[1] }
  if (hash === href.newWorkout) return { name: 'editor' }
  const match = /^#\/seances\/([a-f0-9]{32})(\/modifier)?(?:\?version=([1-9]\d*))?$/.exec(hash)
  if (match) return match[2] ? { name: 'editor', id: match[1] } : { name: 'workout', id: match[1], version: match[3] ? Number(match[3]) : undefined }
  return { name: 'today' }
}

export const href = {
  today: '#/',
  settings: '#/reglages',
  treadmill: '#/reglages?tapis=1',
  direct: '#/direct',
  recordings: '#/bilans',
  report: (id: string) => `#/bilans/${id}`,
  workoutReports: (id: string) => `#/bilans?seance=${id}`,
  coach: '#/coach',
  library: '#/seances',
  myWorkouts: '#/seances?vue=mes',
  coachCreate: '#/coach?creer=seance',
  coachConversation: (id: string) => `#/coach?conversation=${id}`,
  coachAdjust: (id: string, version: number) => `#/coach?workout=${id}&version=${version}`,
  editProposal: (id: string) => `#/propositions/${id}/modifier`,
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
