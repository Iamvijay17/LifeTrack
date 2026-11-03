import { QUICK } from '@/features/quick/QuickActions'

export function QuickActionsGrid({ onOpen }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {QUICK.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            onClick={() => onOpen(kind)}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <Icon className="h-4 w-4 text-secondary" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
