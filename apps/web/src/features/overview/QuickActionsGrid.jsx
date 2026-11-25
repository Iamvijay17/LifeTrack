import { QUICK } from '@/features/quick/QuickActions'

export function QuickActionsGrid({ onOpen }) {
  return (
    <section>
      <h2 className="lt-eyebrow mb-2.5">Quick actions</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {QUICK.map(({ kind, label, icon: Icon, module }) => (
          <button
            key={kind}
            data-module={module}
            onClick={() => onOpen(kind)}
            className="lt-card lt-lift group flex flex-col items-center gap-2 px-2 py-3.5 text-xs font-medium"
          >
            <span className="lt-icon-tile h-9 w-9 transition-transform duration-200 ease-spring group-hover:scale-110">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
