import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import { Coach } from './features/Coach'
import { Editor } from './features/Editor'
import { History } from './features/History'
import { Library } from './features/Library'
import { Live } from './features/Live'
import { SessionDetail } from './features/SessionDetail'
import { Today } from './features/Today'
import { useRoute } from './lib/router'
import './styles/index.css'

function App() {
  const route = useRoute()
  let screen
  switch (route.name) {
    case 'library': screen = <Library />; break
    case 'editor': screen = <Editor key={route.id ?? 'new'} id={route.id} />; break
    case 'history': screen = <History />; break
    case 'session': screen = <SessionDetail key={route.id} id={route.id} />; break
    case 'coach': screen = <Coach />; break
    case 'live': screen = <Live />; break
    default: screen = <Today />
  }
  return <Shell route={route}>{screen}</Shell>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
