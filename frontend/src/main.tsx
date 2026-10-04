import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import { Settings } from './features/Settings'
import { Today } from './features/Today'
import { useRoute } from './lib/router'
import './styles/index.css'

function App() {
  const route = useRoute()
  return (
    <Shell route={route}>
      {route.name === 'settings' ? <Settings /> : <Today />}
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
