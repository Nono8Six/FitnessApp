import { useEffect, useRef } from 'react'
import { Page } from '../components/Shell'
import { Button } from '../components/ui'
import { courseTest } from '../lib/environment'
import { useExecution } from '../lib/execution'

/** Un seul départ par ouverture ; aucune répétition après une réponse incertaine. */
export function CourseTest() {
  const e = useExecution()
  const launched = useRef(false)
  useEffect(() => {
    if (!courseTest || launched.current) return
    launched.current = true
    void e.act('demo')
  }, [e.act])
  return <Page title="Test du mode course">
    <p className="text-label-2" role="status">{!courseTest ? 'Ouvrez le test depuis Aujourd’hui.' : e.error ? 'La course de test n’a pas pu être ouverte.' : 'Préparation du tapis simulé…'}</p>
    <p className="mt-3 text-subhead text-label-2">Aucun mouvement du tapis. Données de test séparées de vos bilans.</p>
    {e.error && <><p role="alert" className="mt-4 text-orange">{e.error}</p>
      <Button variant="gray" className="mt-4" disabled={!!e.pending} onClick={() => void e.act('demo')}>Réessayer</Button></>}
    <a href="/#/" className="pressable mt-6 inline-flex min-h-11 items-center text-accent">Retour à l’application</a>
  </Page>
}
