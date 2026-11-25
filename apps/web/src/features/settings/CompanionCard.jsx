import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AppWindow } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button, buttonVariants } from '@/components/ui/button'
import { CapabilityNote } from '@/features/companion/Capabilities'
import { detectCapabilities, openCompanionWindow } from '@/features/companion/window'

/** Where the Desktop Companion is opened from, and an honest list of what this browser can do for it. */
export function CompanionCard() {
  const caps = useMemo(detectCapabilities, [])
  return (
    <SettingsSection
      headingAs="h3"
      icon={AppWindow}
      title="Desktop Companion"
      desc="Today in a small window: add a task, tick off tasks and habits, run a focus timer and see your next reminders without opening the full app."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            !openCompanionWindow() && toast.error('Your browser blocked the window. Allow pop-ups for LifeTrack and try again.')
          }
        >
          Open companion window
        </Button>
        <Link to="/companion" className={buttonVariants({ variant: 'outline' })}>
          Open in this tab
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Shortcut: <kbd className="rounded border border-border px-1">Alt</kbd> +{' '}
        <kbd className="rounded border border-border px-1">Shift</kbd> + <kbd className="rounded border border-border px-1">L</kbd> while
        LifeTrack is open.
      </p>
      <details className="rounded-lg bg-surface-2/60 p-2.5">
        <summary className="cursor-pointer text-xs font-medium">What works in this browser</summary>
        <div className="pt-2.5">
          <CapabilityNote caps={caps} />
        </div>
      </details>
    </SettingsSection>
  )
}
