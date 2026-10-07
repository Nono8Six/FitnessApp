import { lazy, StrictMode, Suspense, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import { Settings } from './features/Settings'
import { Today } from './features/Today'
import { Library } from './features/Library'
import { Editor } from './features/Editor'
import { Workout } from './features/Workout'
import { Report } from './features/Report'
import { Reports } from './features/Reports'
import { Direct, ExecutionSheets } from './features/Direct'
import { ExecutionProvider } from './lib/execution'
import { useCurrentProfile } from './lib/profiles'
import { Page } from './components/Shell'
import { href, navigate, useRoute } from './lib/router'
import './styles/index.css'

const Coach = lazy(() => import('./features/Coach').then(module => ({ default: module.Coach })))

function App() {
  const route = useRoute()
  const profile = useCurrentProfile()
  const previousProfile = useRef(profile?.id)
  useEffect(() => {
    if (previousProfile.current && previousProfile.current !== profile?.id && (route.name === 'editor' || route.name === 'workout' || route.name === 'coach')) {
      navigate(route.name === 'coach' ? href.coach : href.library)
    }
    previousProfile.current = profile?.id
  }, [profile?.id, route.name])
  return (
    <Shell route={route}>
      <div key={`${profile?.id}:${JSON.stringify(route)}`}>
        {route.name === 'direct' ? <Direct /> : route.name === 'settings' ? <Settings treadmillOpen={route.treadmill} /> : !profile ? <Page title="Fitness"><p className="text-label-2" role="status">Chargement du profil…</p></Page>
          : route.name === 'library' ? <Library profile={profile.id} initialView={route.view} />
          : route.name === 'editor' ? <Editor profile={profile.id} id={route.id} proposalId={route.proposalId} />
          : route.name === 'workout' ? <Workout profile={profile.id} id={route.id} requestedVersion={route.version} />
          : route.name === 'report' ? <Report profile={profile.id} id={route.id} />
          : route.name === 'recordings' ? <Reports profile={profile.id} workoutId={route.workoutId} />
          : route.name === 'coach' ? <Suspense fallback={<Page title="Coach"><p role="status" className="text-label-2">Chargement…</p></Page>}><Coach profile={profile.id} target={route.target} conversationId={route.conversationId} createWorkout={route.createWorkout} /></Suspense>
          : <Today profile={profile.id} />}
      </div>
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExecutionProvider><App /><ExecutionSheets /></ExecutionProvider>
  </StrictMode>,
)
