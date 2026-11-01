import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { NAV, MOBILE_PRIMARY } from '@/lib/nav'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const [more, setMore] = useState(false)
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to))
  const rest = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to))
  const item = (isActive) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-secondary' : 'text-muted-foreground')
  return (
    <>
      <nav aria-label="Mobile" className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-sidebar/95 backdrop-blur md:hidden">
        {primary.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => item(isActive)}>
            <Icon className="h-5 w-5" aria-hidden />{short ?? label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className={item(false)} aria-label="More pages"><MoreHorizontal className="h-5 w-5" />More</button>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title="All pages">
        <div className="grid grid-cols-3 gap-2">
          {rest.map(({ to, label, short, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)} className={({ isActive }) => cn('flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs font-medium', isActive ? 'border-primary/50 bg-primary/10 text-secondary' : 'text-muted-foreground')}>
              <Icon className="h-5 w-5" />{short ?? label}
            </NavLink>
          ))}
        </div>
      </Dialog>
    </>
  )
}
