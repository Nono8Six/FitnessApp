import { lazy, StrictMode, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Page, Shell } from './components/Shell'
import { Skeleton } from './components/ui'
import { Settings } from './features/Settings'
import { Today } from './features/Today'
import { CourseTest } from './features/CourseTest'
import { Library } from './features/Library'
import { Editor } from './features/Editor'
import { FouleeTransfer } from './features/FouleeImport'
import { Workout } from './features/Workout'
import { Report } from './features/Report'
import { Reports } from './features/Reports'
import { Direct, ExecutionSheets } from './features/Direct'
import { ExecutionProvider } from './lib/execution'
import { useCurrentProfile, useProfiles } from './lib/profiles'
import { href, navigate, useRoute } from './lib/router'
import type { WorkoutInput } from './lib/workouts'
import './styles/index.css'

const Coach = lazy(() => import('./features/Coach').then(module => ({ default: module.Coach })))
const Planning = lazy(() => import('./features/Planning').then(module => ({ default: module.Planning })))

function ProfileLoading() {
  const profiles = useProfiles()
  return <Page title="Fitness">{profiles.status === 'loading' && <Skeleton label="Chargement du profil" />}</Page>
}

function App() {
  const route = useRoute()
  const profile = useCurrentProfile()
  const [fouleeImport, setFouleeImport] = useState<{ profile: string; workout: WorkoutInput }>()
  const editingImport = route.name === 'editor' && route.fromFoulee === true
  const previousProfile = useRef(profile?.id)
  useEffect(() => {
    if (previousProfile.current && previousProfile.current !== profile?.id) {
      if (route.name === 'coach') navigate(href.coach)
      if (route.name === 'editor' || route.name === 'workout') navigate(href.library)
      if (route.name === 'planning' && route.report) navigate(href.planning)
    }
    previousProfile.current = profile?.id
  }, [profile?.id, route.name])
  useEffect(() => {
    if (!editingImport) setFouleeImport(undefined)
  }, [editingImport])
  const openImportedWorkout = (workout: WorkoutInput) => {
    if (!profile) return
    setFouleeImport({ profile: profile.id, workout })
    navigate(href.fouleeWorkout)
  }
  return (
    <Shell route={route}>
      <div key={`${profile?.id}:${JSON.stringify(route)}`}>
        {route.name === 'test' ? <CourseTest /> : route.name === 'direct' ? <Direct /> : route.name === 'settings' ? <Settings treadmillOpen={route.treadmill} /> : !profile ? <ProfileLoading />
          : route.name === 'library' ? <Library profile={profile.id} initialView={route.view} onImport={openImportedWorkout} />
          : route.name === 'fouleeTransfer' ? <FouleeTransfer profile={profile} query={route.query} onImport={openImportedWorkout} />
          : route.name === 'editor' ? editingImport && fouleeImport?.profile !== profile.id
            ? <Page title="Importer depuis Foulée" back={{ label: 'Séances', href: href.myWorkouts }}>
              <p className="text-subhead text-label-2">Sélectionnez de nouveau le fichier dans Séances pour reprendre l’import.</p>
            </Page>
            : <Editor profile={profile.id} id={route.id} proposalId={route.proposalId} imported={editingImport ? fouleeImport?.workout : undefined} />
          : route.name === 'workout' ? <Workout profile={profile.id} id={route.id} requestedVersion={route.version} />
          : route.name === 'report' ? <Report profile={profile.id} id={route.id} />
          : route.name === 'recordings' ? <Reports profile={profile.id} workoutId={route.workoutId} />
          : route.name === 'planning' ? <Suspense fallback={<Page title="Planning"><Skeleton label="Chargement du planning" /></Page>}>
            <Planning profile={profile.id} week={route.week} day={route.day} report={route.report} view={route.view} month={route.month} />
          </Suspense>
          : route.name === 'coach' ? <Suspense fallback={<Page title="Coach"><p role="status" className="text-label-2">Chargement…</p></Page>}><Coach profile={profile.id} target={route.target} conversationId={route.conversationId} createWorkout={route.createWorkout} progress={route.progress} /></Suspense>
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
