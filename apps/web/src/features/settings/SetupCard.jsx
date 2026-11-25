import { Check, Compass, RotateCcw, Sparkles } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { restartTour, resumeOnboarding, useOnboarding } from '@/hooks/useOnboarding'
import { TOURS } from '@/lib/tours'
import { canResume } from '@/lib/onboarding'
import { startTour } from '@/features/tour/TourProvider'

const RESULT = { done: 'Completed', skipped: 'Skipped' }

/** Finish or redo the first-run setup, and replay any guided tour. */
export function SetupCard() {
  const s = useOnboarding()
  const setupLine =
    s.status === 'done'
      ? 'Setup is complete. You can run it again to change your answers.'
      : s.status === 'existing'
        ? 'You were already set up. Run the guided setup any time to tune LifeTrack.'
        : 'Your setup is not finished. Pick up where you left off.'
  return (
    <SettingsSection headingAs="h3" icon={Compass} title="Setup & tours" desc="Finish the guided setup or replay a tour of any module.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">{setupLine}</p>
        <Button variant={canResume(s) ? 'default' : 'outline'} onClick={resumeOnboarding}>
          <Sparkles className="h-4 w-4" aria-hidden /> {canResume(s) ? 'Continue setup' : 'Run setup again'}
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Guided tours">
        {TOURS.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{t.label}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.tours[t.key] ? (
                  <>
                    <Check className="h-3 w-3 text-success" aria-hidden /> {RESULT[s.tours[t.key]]}
                  </>
                ) : (
                  'Not taken yet'
                )}
              </p>
            </div>
            <div className="flex gap-1">
              {s.tours[t.key] && (
                <Button variant="ghost" size="sm" aria-label={`Reset ${t.label} tour`} onClick={() => restartTour(t.key)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => startTour(t.key)}>
                {s.tours[t.key] ? 'Restart' : 'Start'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SettingsSection>
  )
}
