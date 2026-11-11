import { Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PageLoader } from '@/components/loaders/PageLoader'
import { messageForPath } from '@/components/loaders/messages'
import { ChartGradients } from '@/components/shared/chartParts'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Banners, SaveStatus, LiveDot } from './StatusIndicators'
import { Logo } from './Logo'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { ProfileMenu } from './ProfileMenu'
import { useReminderRunner } from '@/features/notifications/useReminderRunner'
import { useNotificationDelivery } from '@/features/notifications/useNotificationDelivery'
import { useSmartNotifications } from '@/features/notifications/useSmartNotifications'
import { useRecurringRunner } from '@/features/finance/useRecurringRunner'
import { useCalendarAlerts } from '@/features/calendar/useCalendarAlerts'
import { QuickAddMenu, QuickFab, QuickActionsProvider } from '@/features/quick/QuickActions'
import { useSettings } from '@/hooks/useSettings'
import { useThemeSync } from '@/hooks/useTheme'
import { seedDefaults } from '@/services/api'
import { moduleForPath, navItemForPath } from '@/lib/modules'
import { pageTitle } from '@/lib/nav'
import { cn } from '@/lib/utils'

const read = () => {
  try {
    return localStorage.getItem('lifetrack:sidebar') === '1'
  } catch {
    return false
  }
}

/** The sticky top bar. On its own so that crossing the scroll threshold repaints only this, and its hairline appears only once content is under it. */
function Header() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 4) // React skips the render when the answer hasn't changed
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [])
  const { pathname } = useLocation()
  const here = navItemForPath(pathname)
  const Icon = here?.icon
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b px-4 transition-colors duration-200 md:px-6',
        scrolled ? 'lt-glass border-border' : 'border-transparent',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="md:hidden">
          <Logo />
        </div>
        {here && (
          <m.span
            key={here.to}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: ease.out }}
            className="hidden items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-muted-foreground xl:flex"
          >
            <Icon className="h-3.5 w-3.5 text-mod-text" aria-hidden />
            {here.label}
          </m.span>
        )}
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <SaveStatus />
        <LiveDot />
        <QuickAddMenu />
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  )
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('lifetrack:sidebar', c ? '0' : '1')
      } catch {
        /* preference only */
      }
      return !c
    })
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const main = useRef(null)
  useThemeSync()
  useReminderRunner()
  useSmartNotifications()
  useNotificationDelivery()
  useRecurringRunner()
  useCalendarAlerts()

  // First sign-in on any device: create default topics / exercise library once (idempotent via unique keys).
  const { row, loading } = useSettings()
  const seeding = useRef(false)
  useEffect(() => {
    if (loading || seeding.current || (row && row.defaults_seeded)) return
    seeding.current = true
    seedDefaults().catch((e) => {
      seeding.current = false
      toast.error(`Could not set up defaults: ${e.message}`)
    })
  }, [loading, row])

  useEffect(() => {
    main.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
    document.title = pageTitle(pathname)
  }, [pathname])

  // The whole app takes on the module's colour: the ambient light, charts, progress and active states.
  const module = moduleForPath(pathname)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.module = module
    return () => {
      delete root.dataset.module
    }
  }, [module])

  return (
    <QuickActionsProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary-solid focus:px-3 focus:py-1.5 focus:text-white"
      >
        Skip to content
      </a>
      <ChartGradients />
      <AnimatePresence initial={false}>
        <m.div
          key={module}
          aria-hidden
          data-module={module}
          className="lt-ambient"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      </AnimatePresence>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('min-h-dvh transition-[padding] duration-200 ease-out', collapsed ? 'md:pl-[68px]' : 'md:pl-60')}>
        <Banners />
        <Header />
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className="mx-auto w-full max-w-[76rem] px-4 pb-28 pt-4 outline-none focus-visible:ring-0 md:px-6 md:pb-10 md:pt-5"
        >
          {/* A page leaves quickly and the next one rises in. Nothing here waits on data: each page shows its own skeleton. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={pathname}
              data-reveal
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.09, ease: ease.in } }}
              transition={{ duration: 0.26, ease: ease.out }}
            >
              <ErrorBoundary variant="section" resetKey={pathname}>
                <Suspense fallback={<PageLoader message={messageForPath(pathname)} />}>{outlet}</Suspense>
              </ErrorBoundary>
            </m.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
      <QuickFab />
    </QuickActionsProvider>
  )
}
