import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react'
import { NAV_GROUPS } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'
import { Logo } from './Logo'

export function Sidebar({ collapsed, onToggle }) {
  const { displayName, user } = useAuth()
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        <Logo showText={!collapsed} />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="mb-2">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
            ) : (
              <div className="mx-3 my-2 border-t border-border" />
            )}
            <div className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive ? 'bg-primary/15 text-secondary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {collapsed && <span className="sr-only">{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={cn('flex items-center gap-1 border-t border-border p-2', collapsed && 'flex-col')}>
        {!collapsed && (
          <div className="min-w-0 flex-1 px-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        )}
        <button
          onClick={() => auth.signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </aside>
  )
}
