import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import { Settings } from './features/Settings'
import { Today } from './features/Today'
import { Library } from './features/Library'
import { Editor } from './features/Editor'
import { Workout } from './features/Workout'
import { useCurrentProfile } from './lib/profiles'
import { Page } from './components/Shell'
import { href, navigate, useRoute } from './lib/router'
import './styles/index.css'

function App() {
  const route = useRoute()
  const profile = useCurrentProfile()
  const previousProfile = useRef(profile?.id)
  useEffect(() => {
    if (previousProfile.current && previousProfile.current !== profile?.id && (route.name === 'editor' || route.name === 'workout')) {
      navigate(href.library)
    }
    previousProfile.current = profile?.id
  }, [profile?.id, route.name])
  return (
    <Shell route={route}>
      <div key={`${profile?.id}:${route.name}:${'id' in route ? route.id ?? '' : ''}`}>
        {route.name === 'settings' ? <Settings /> : !profile ? <Page title="Fitness"><p className="text-label-2" role="status">Chargement du profil…</p></Page>
          : route.name === 'library' ? <Library profile={profile.id} />
          : route.name === 'editor' ? <Editor profile={profile.id} id={route.id} />
          : route.name === 'workout' ? <Workout profile={profile.id} id={route.id} />
          : <Today profile={profile.id} />}
      </div>
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
