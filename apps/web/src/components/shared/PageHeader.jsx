import { useLocation } from 'react-router-dom'
import { ease, m } from '@/components/motion/primitives'
import { navItemForPath } from '@/lib/modules'

/** The top of every page. The icon and accent come from the route, so each module wears its own colour. */
export function PageHeader({ title, description, actions, icon }) {
  const { pathname } = useLocation()
  const Icon = icon ?? navItemForPath(pathname)?.icon
  return (
    <m.div
      data-reveal
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: ease.out }}
      className="mb-6 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="lt-icon-tile h-11 w-11 rounded-[0.875rem]">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-display md:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </m.div>
  )
}
