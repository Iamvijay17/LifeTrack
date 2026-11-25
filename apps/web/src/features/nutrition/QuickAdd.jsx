import { History, Zap } from 'lucide-react'

/**
 * One-tap re-logging of foods you eat often and ate lately. `items` come from frequentFoods() / recentFoods(); tapping logs the same
 * amount again into the meal that suits the time of day.
 */
export function QuickAdd({ frequent, recent, onPick, busy }) {
  const seen = new Set(frequent.map((f) => f.key))
  const rest = recent.filter((r) => !seen.has(r.key)).slice(0, 6)
  const groups = [
    { id: 'frequent', label: 'Frequent', icon: Zap, items: frequent },
    { id: 'recent', label: 'Recent', icon: History, items: rest },
  ].filter((g) => g.items.length)
  if (!groups.length) return null
  return (
    <section aria-label="Quick add" className="space-y-2">
      {groups.map((g) => (
        <div key={g.id} className="flex items-center gap-2">
          <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <g.icon className="h-3.5 w-3.5" aria-hidden />
            {g.label}
          </span>
          <div className="scrollbar-none -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1">
            {g.items.map((f) => (
              <button
                key={f.key}
                type="button"
                disabled={busy}
                onClick={() => onPick(f.entry)}
                aria-label={`Add ${f.name} again, ${Math.round(f.entry.kcal)} calories`}
                className="lt-press shrink-0 rounded-full border border-border bg-card/70 px-3 py-2 text-left text-[13px] shadow-card transition-colors hover:border-mod/50 hover:bg-mod/10 disabled:opacity-60 md:py-1.5"
              >
                <span className="font-medium">{f.name.length > 26 ? `${f.name.slice(0, 25)}…` : f.name}</span>
                <span className="ml-1.5 tabular-nums text-muted-foreground">{Math.round(f.entry.kcal)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
