import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import { Today } from './features/Today'
import { useRoute } from './lib/router'
import './styles/index.css'

function App() {
  const route = useRoute()
  return (
    <Shell route={route}>
      <Today />
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
