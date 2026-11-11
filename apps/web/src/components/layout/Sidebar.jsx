import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, LogOut, Lock } from 'lucide-react'
import { m, spring } from '@/components/motion/primitives'
import { Tooltip } from '@/components/ui/tooltip'
import { NAV_GROUPS } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { auth } from '@/services/auth'
import { Logo } from './Logo'

function Item({ item, collapsed }) {
  const { to, label, icon: Icon, end, module } = item
  const locked = useModuleLocks().isLocked(module)
  return (
    <Tooltip label={label} disabled={!collapsed}>
      <NavLink
        to={to}
        end={end}
        data-module={module}
        className={({ isActive }) =>
          cn(
            'group relative flex h-9 items-center gap-2.5 rounded-lg px-1 text-[13px] font-medium transition-colors duration-150',
            collapsed && 'justify-center px-0',
            isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <m.span
                layoutId="nav-active"
                aria-hidden
                className="absolute inset-0 rounded-lg bg-mod/[0.13] ring-1 ring-inset ring-mod/20"
                transition={spring.snappy}
              />
            )}
            <span
              className={cn(
                'relative grid h-7 w-7 shrink-0 place-items-center rounded-md transition-[transform,color] duration-200',
                isActive ? 'lt-icon-tile rounded-md' : 'group-hover:scale-110 group-hover:text-mod-text',
              )}
            >
              <Icon className="h-[15px] w-[15px]" aria-hidden />
            </span>
            {collapsed ? <span className="sr-only">{label}</span> : <span className="relative truncate">{label}</span>}
            {locked && (
              <>
                <Lock
                  aria-hidden
                  data-testid="nav-lock"
                  className={cn('relative h-3 w-3 shrink-0 text-muted-foreground', collapsed ? 'absolute right-1 top-1' : 'ml-auto mr-2')}
                />
                <span className="sr-only"> (locked)</span>
              </>
            )}
          </>
        )}
      </NavLink>
    </Tooltip>
  )
}

export function Sidebar({ collapsed, onToggle }) {
  const { displayName, user } = useAuth()
  const initial = (displayName || user?.email || '?').trim()[0]?.toUpperCase()
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar/80 transition-[width] duration-200 ease-out md:flex',
        collapsed ? 'w-[68px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center px-4', collapsed && 'justify-center px-0')}>
        <Logo showText={!collapsed} />
      </div>
      <m.nav aria-label="Main" layoutScroll className="scrollbar-none flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="mb-3">
            {!collapsed ? (
              <p className="lt-eyebrow whitespace-nowrap px-1 pb-1 pt-2 text-[10px]">{g.title}</p>
            ) : (
              <div className="mx-2 my-2 border-t border-border" />
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Item key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </m.nav>
      <div className={cn('flex shrink-0 items-center gap-1 border-t border-border p-2', collapsed && 'flex-col')}>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-semibold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        )}
        <Tooltip label="Sign out" disabled={!collapsed}>
          <button
            onClick={() => auth.signOut()}
            aria-label="Sign out"
            title={collapsed ? undefined : 'Sign out'}
            className="lt-press grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Expand sidebar" disabled={!collapsed}>
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? undefined : 'Collapse sidebar'}
            className="lt-press grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
