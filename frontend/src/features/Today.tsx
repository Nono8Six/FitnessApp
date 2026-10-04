import { RunIcon } from '../components/Icons'
import { Page } from '../components/Shell'
import { useToday } from '../lib/date'

export function Today() {
  const today = useToday()
  return (
    <Page title="Aujourd’hui" overline={today}>
      <section aria-label="Prochaine séance" className="flex flex-col items-center rounded-[22px] bg-surface px-6 py-12 text-center desk:max-w-[760px]">
        <span className="grid size-14 place-items-center rounded-full bg-fill-4 text-label-2">
          <RunIcon size={28} />
        </span>
        <p className="mt-4 text-headline">Aucune séance prévue</p>
      </section>
    </Page>
  )
}
