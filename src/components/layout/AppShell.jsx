import { Suspense, useEffect, useRef, useState } from 'react'
import { PageLoader } from '@/components/loaders/PageLoader'
import { messageForPath } from '@/components/loaders/messages'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Banners, SaveStatus, LiveDot } from './StatusIndicators'
import { Logo } from './Logo'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { ProfileMenu } from './ProfileMenu'
import { useReminderRunner } from '@/hooks/useReminderRunner'
import { QuickAddMenu, QuickFab, QuickActionsProvider } from '@/features/quick/QuickActions'
import { useSettings } from '@/hooks/useSettings'
import { useThemeSync } from '@/hooks/useTheme'
import { seedDefaults } from '@/services/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const read = () => { try { return localStorage.getItem('lifetrack:sidebar') === '1' } catch { return false } }

export function AppShell() {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('lifetrack:sidebar', c ? '0' : '1') } catch { /* preference only */ } return !c })
  const { pathname } = useLocation()
  const main = useRef(null)
  useThemeSync()
  useReminderRunner()

  // First sign-in on any device: create default topics / exercise library once (idempotent via unique keys).
  const { settings, row, loading } = useSettings()
  const seeding = useRef(false)
  useEffect(() => {
    if (loading || seeding.current || (row && row.defaults_seeded)) return
    seeding.current = true
    seedDefaults().catch((e) => { seeding.current = false; toast.error(`Could not set up defaults: ${e.message}`) })
  }, [loading, row])

  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [pathname])

  return (
    <QuickActionsProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1.5 focus:text-white">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('min-h-dvh transition-[padding] duration-200', collapsed ? 'md:pl-16' : 'md:pl-60')}>
        <Banners />
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
          <div className="md:hidden"><Logo /></div>
          <GlobalSearch />
          <div className="flex items-center gap-2 sm:gap-3">
            <SaveStatus />
            <LiveDot />
            <QuickAddMenu />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 outline-none md:px-6 md:pb-10">
          <Suspense fallback={<PageLoader message={messageForPath(pathname)} />}><Outlet /></Suspense>
        </main>
      </div>
      <MobileNav />
      <QuickFab />
    </QuickActionsProvider>
  )
}
