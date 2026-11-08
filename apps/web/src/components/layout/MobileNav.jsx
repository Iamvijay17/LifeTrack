import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { NAV, NAV_GROUPS, MOBILE_PRIMARY } from '@/lib/nav'
import { Dialog } from '@/components/ui/dialog'
import { LayoutGroup, m, spring } from '@/components/motion/primitives'
import { tick } from '@/lib/celebrate'
import { cn } from '@/lib/utils'

/** A pill that slides between tabs, behind the icon, like the native Material and iOS tab bars. */
function Pill() {
  return (
    <m.span
      layoutId="tab-pill"
      aria-hidden
      className="absolute inset-x-1 top-1 h-8 rounded-full bg-mod/[0.18]"
      transition={spring.snappy}
    />
  )
}

export function MobileNav() {
  const [more, setMore] = useState(false)
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to))
  const item = (isActive) =>
    cn(
      'lt-press relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium transition-colors',
      isActive ? 'text-mod-text' : 'text-muted-foreground',
    )
  return (
    <>
      <nav aria-label="Mobile" className="lt-glass pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border md:hidden">
        <LayoutGroup id="mobile-nav">
          <div className="flex px-1">
            {primary.map(({ to, label, short, icon: Icon, end, module }) => (
              <NavLink key={to} to={to} end={end} data-module={module} onClick={() => tick()} className={({ isActive }) => item(isActive)}>
                {({ isActive }) => (
                  <>
                    {isActive && <Pill />}
                    <Icon className="relative z-10 h-5 w-5" aria-hidden />
                    <span className="relative mt-1">{short ?? label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              onClick={() => {
                tick()
                setMore(true)
              }}
              className={item(false)}
              aria-label="More pages"
            >
              <MoreHorizontal className="relative z-10 h-5 w-5" />
              <span className="relative mt-1">More</span>
            </button>
          </div>
        </LayoutGroup>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title="All pages">
        <div className="space-y-4">
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((n) => !MOBILE_PRIMARY.includes(n.to))
            if (!items.length) return null
            return (
              <section key={g.title}>
                <h3 className="lt-eyebrow mb-2">{g.title}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {items.map(({ to, label, short, icon: Icon, module }) => (
                    <NavLink
                      key={to}
                      to={to}
                      data-module={module}
                      onClick={() => setMore(false)}
                      className={({ isActive }) =>
                        cn(
                          'lt-press flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs font-medium',
                          isActive ? 'border-mod/50 bg-mod/10 text-mod-text' : 'border-border bg-surface-2/50 text-foreground/90',
                        )
                      }
                    >
                      <span className="lt-icon-tile h-9 w-9">
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      {short ?? label}
                    </NavLink>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </Dialog>
    </>
  )
}
