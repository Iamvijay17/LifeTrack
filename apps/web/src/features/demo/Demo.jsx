import { useState } from 'react'
import { toast } from 'sonner'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import { enterDemo, exitDemo, resetDemo, useDemo, useDemoInfo } from '@/services/demo'

/** A strip across the top of every page while demo mode is on, so nobody mistakes sample data for their own. */
export function DemoBanner() {
  const on = useDemo()
  const [exit, exiting] = useAction(exitDemo)
  if (!on) return null
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-center text-xs text-warning"
    >
      <span>
        <b>DEMO MODE</b>: sample data only. Nothing here is saved to your account, and your real data is untouched.
      </span>
      <button type="button" onClick={() => exit()} disabled={exiting} className="font-semibold underline underline-offset-2">
        Exit demo
      </button>
    </div>
  )
}

/** A small pill in the header, visible on every screen size. */
export function DemoChip() {
  return useDemo() ? (
    <span className="rounded-full border border-warning/50 bg-warning/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
      Demo
    </span>
  ) : null
}

const total = (counts) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0)

/** Settings: try LifeTrack with realistic sample data, then go back to your own. */
export function DemoCard() {
  const on = useDemo()
  const info = useDemoInfo()
  const [busy, setBusy] = useState(false)
  const run = (fn, ok) => async () => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(`Could not ${ok ? 'do that' : 'start the demo'}: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingsSection
      headingAs="h3"
      icon={FlaskConical}
      title="Demo mode"
      desc="Explore every module with realistic sample data. It lives in memory only and never mixes with your account."
    >
      {on ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            You are in the demo ({total(info?.counts)} sample records). Edit anything you like: it all disappears when you exit or reload.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={busy} onClick={run(resetDemo, 'Demo data reset')}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset demo data
            </Button>
            <Button loading={busy} onClick={run(exitDemo, 'Back to your data')}>
              Exit demo
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            Your own data is not read or changed while the demo runs, and nothing you do in it is saved. Reloading the page also ends it.
          </p>
          <Button loading={busy} onClick={run(enterDemo)}>
            <FlaskConical className="h-4 w-4" aria-hidden /> Start demo
          </Button>
        </>
      )}
    </SettingsSection>
  )
}
