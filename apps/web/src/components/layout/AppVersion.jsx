import { Tooltip } from '@/components/ui/tooltip'
import { APP_VERSION } from '@/lib/version'
import { cn } from '@/lib/utils'

/** Small muted "LifeTrack v1.0.0" label. Collapsed sidebar shows just "v1.0.0". */
export function AppVersion({ collapsed = false, className }) {
  return (
    <div className={cn('shrink-0 px-3 pb-2 pt-0.5 text-center', className)}>
      <Tooltip label="Current application version">
        <span className="cursor-default select-none text-[10px] tabular-nums text-muted-foreground/70">
          {collapsed ? `v${APP_VERSION}` : `LifeTrack v${APP_VERSION}`}
        </span>
      </Tooltip>
    </div>
  )
}
