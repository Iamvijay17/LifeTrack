import { fmtDuration } from '@/lib/dates'

/** Regularity, averages and nights that met the goal. `c` is sleepConsistency(); needs three nights, so shows nothing until then. */
export function SleepFacts({ c, goalMinutes, energy }) {
  const facts = [
    ['Goal', fmtDuration(goalMinutes)],
    ['Met goal', c.nightsLogged ? `${c.nightsMetGoal} of ${c.nightsLogged} nights` : null],
    ['Usual bedtime', c.avgBedtime],
    ['Usual wake-up', c.avgWake],
    ['Regularity', c.label && `${c.label} (±${c.spreadMinutes} min)`],
    ['Avg energy', energy != null ? `${energy} / 5` : null],
  ].filter(([, v]) => v)
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-3" data-testid="sleep-facts">
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium tracking-tight">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
