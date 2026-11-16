import { ArrowDown, ArrowUp, ListOrdered, Pin, PinOff, RotateCcw } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { setAppearance, useAppearance } from '@/hooks/useAppearance'
import { MAX_PINNED, arrangeNav, moveNavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'

const iconBtn =
  'grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent md:h-8 md:w-8'

/** Favourites and the order of the sidebar. Favourites sit at the top of the sidebar and become the phone's bottom bar. */
export function NavigationCard() {
  const { sidebar } = useAppearance()
  const { pinned } = arrangeNav(sidebar)
  const isPinned = (to) => pinned.some((n) => n.to === to)
  const full = pinned.length >= MAX_PINNED
  const togglePin = (to) =>
    setAppearance({
      sidebar: { pinned: isPinned(to) ? pinned.filter((n) => n.to !== to).map((n) => n.to) : [...pinned.map((n) => n.to), to] },
    })
  const custom = sidebar.order.length > 0 || sidebar.pinned.length > 0
  return (
    <SettingsSection
      headingAs="h3"
      icon={ListOrdered}
      title="Navigation"
      desc={`Pin up to ${MAX_PINNED} favourites (they lead the sidebar and fill the phone's bottom bar) and put pages in the order you use them.`}
    >
      <div className="space-y-4">
        {arrangeNav({ order: sidebar.order }).groups.map((g) => {
          return (
            <section key={g.title} aria-label={g.title}>
              <h4 className="lt-eyebrow mb-1">{g.title}</h4>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.items.map((n, i, list) => {
                  const Icon = n.icon
                  const on = isPinned(n.to)
                  return (
                    <li key={n.to} data-module={n.module} className="flex items-center gap-2 px-2.5 py-1">
                      <span className="lt-icon-tile h-7 w-7 rounded-md">
                        <Icon className="h-[15px] w-[15px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{n.label}</span>
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => setAppearance({ sidebar: { order: moveNavItem(sidebar.order, n.to, -1) } })}
                        disabled={i === 0}
                        aria-label={`Move ${n.label} up`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => setAppearance({ sidebar: { order: moveNavItem(sidebar.order, n.to, 1) } })}
                        disabled={i === list.length - 1}
                        aria-label={`Move ${n.label} down`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(iconBtn, on && 'text-mod-text')}
                        onClick={() => togglePin(n.to)}
                        disabled={!on && full}
                        aria-pressed={on}
                        aria-label={on ? `Unpin ${n.label}` : `Pin ${n.label}`}
                        title={!on && full ? `You can pin ${MAX_PINNED} pages` : undefined}
                      >
                        {on ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="flex justify-end border-t border-border pt-3">
        <Button variant="ghost" size="sm" disabled={!custom} onClick={() => setAppearance({ sidebar: { order: [], pinned: [] } })}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Restore default navigation
        </Button>
      </div>
    </SettingsSection>
  )
}
