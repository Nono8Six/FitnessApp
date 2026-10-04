import { Page } from '../components/Shell'
import { Group } from '../components/ui'
import { HISTORY, monthLabel } from '../data/demo'
import { dec1 } from '../lib/format'
import { useProfile } from '../lib/profile'
import { scenario } from '../lib/router'
import { SessionRow } from './Today'

export function History() {
  const profile = useProfile()
  const history = scenario() === 'empty' ? [] : HISTORY[profile]
  const months = [...new Set(history.map((s) => s.date.slice(0, 7)))]
  return (
    <Page title="Historique">
      {!history.length && <div className="rounded-[12px] bg-surface px-4 py-6 text-center text-subhead text-label-2">Aucune séance enregistrée.</div>}
      <div className="grid gap-8 desk:max-w-[760px]">
        {months.map((m) => {
          const list = history.filter((s) => s.date.startsWith(m))
          const min = list.reduce((n, s) => n + s.activeSec / 60, 0)
          const km = list.reduce((n, s) => n + s.km, 0)
          return (
            <section key={m} aria-label={monthLabel(`${m}-01`)}>
              <div className="mb-2 px-1">
                <h2 className="text-title3">{monthLabel(`${m}-01`)}</h2>
                <p className="num text-subhead text-label-2">{list.length} séance{list.length > 1 ? 's' : ''} · {min} min · {dec1(km)} km</p>
              </div>
              <Group>
                {list.map((s) => <SessionRow key={s.id} id={s.id} />)}
              </Group>
            </section>
          )
        })}
      </div>
    </Page>
  )
}
