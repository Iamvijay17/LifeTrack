import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Progress, Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { setAppearance } from '@/hooks/useAppearance'
import { finishOnboarding, putOffOnboarding, updateOnboarding, useOnboarding } from '@/hooks/useOnboarding'
import { useSettings } from '@/hooks/useSettings'
import { applyTheme } from '@/hooks/useTheme'
import { ACCENTS } from '@/lib/appearance'
import { TIMEZONES } from '@/lib/dates'
import { parseMoney } from '@/lib/money'
import { MAX_FAVOURITES, MODULE_CHOICES, STEPS, answeredSteps, normalizeAnswers, planApply, progressOf } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { auth } from '@/services/auth'
import { startTour } from '@/features/tour/TourProvider'

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

function Pick({ on, onClick, title, hint, disabled }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'lt-press flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-40',
        on ? 'border-primary-solid bg-primary-solid/10' : 'border-border bg-card/60 hover:border-muted-foreground/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
          on ? 'border-primary-solid bg-primary-solid text-white' : 'border-border',
        )}
      >
        {on && <Check className="h-3 w-3" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  )
}

const Grid = ({ children }) => <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
const Note = ({ children }) => <p className="text-xs text-muted-foreground">{children}</p>

/** One step's fields. `d` is the draft (strings as typed), `set` merges a change into it. */
function StepBody({ step, d, set }) {
  switch (step) {
    case 'welcome':
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>LifeTrack keeps your learning, career, fitness, health, money and daily plan in one place.</p>
          <p>A few quick questions tune it to you. Every one is optional, you can skip any step, and you can finish later from Settings.</p>
        </div>
      )
    case 'profile':
      return (
        <Grid>
          <Field label="What should we call you?">
            <Input maxLength={80} value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} autoComplete="given-name" />
          </Field>
          <Field label="Timezone" hint="Used for your daily reset and reminders.">
            <Select value={d.timezone ?? deviceZone() ?? 'Asia/Kolkata'} onChange={(e) => set({ timezone: e.target.value })}>
              {[...new Set([deviceZone(), ...TIMEZONES].filter(Boolean))].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>
      )
    case 'modules': {
      const chosen = d.modules ?? []
      const toggle = (k) => set({ modules: chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k] })
      return (
        <div className="space-y-3">
          <Note>
            Pick up to {MAX_FAVOURITES}. They become your favourites at the top of the sidebar and on the phone's bottom bar. Nothing is
            hidden: every module stays available.
          </Note>
          <Grid>
            {MODULE_CHOICES.map((c) => (
              <Pick
                key={c.key}
                on={chosen.includes(c.key)}
                title={c.label}
                hint={c.hint}
                disabled={!chosen.includes(c.key) && chosen.length >= MAX_FAVOURITES}
                onClick={() => toggle(c.key)}
              />
            ))}
          </Grid>
        </div>
      )
    }
    case 'learning':
      return (
        <div className="space-y-4">
          <Field label="Daily study target (minutes)" hint="Your learning progress is measured against this. 0 turns it off.">
            <Input
              inputMode="numeric"
              placeholder="120"
              value={d.study_minutes ?? ''}
              onChange={(e) => set({ study_minutes: e.target.value })}
            />
          </Field>
          <Pick
            on={d.job_search === true}
            title="I'm actively looking for a job"
            hint="Shows application and interview reminders on your dashboard."
            onClick={() => set({ job_search: d.job_search === true ? false : true })}
          />
        </div>
      )
    case 'fitness':
      return (
        <Grid>
          <Field label="Water goal (ml / day)">
            <Input
              inputMode="numeric"
              placeholder="3000"
              value={d.water_goal_ml ?? ''}
              onChange={(e) => set({ water_goal_ml: e.target.value })}
            />
          </Field>
          <Field label="Steps goal (/ day)">
            <Input
              inputMode="numeric"
              placeholder="8000"
              value={d.steps_goal ?? ''}
              onChange={(e) => set({ steps_goal: e.target.value })}
            />
          </Field>
          <Field label="Sleep goal (hours)" hint="Between 4 and 12.">
            <Input inputMode="decimal" placeholder="8" value={d.sleep_hours ?? ''} onChange={(e) => set({ sleep_hours: e.target.value })} />
          </Field>
        </Grid>
      )
    case 'finance':
      return (
        <Grid>
          <Field label="Currency">
            <Select value={d.currency ?? 'INR'} onChange={(e) => set({ currency: e.target.value })}>
              <option value="INR">Indian rupee (₹)</option>
              <option value="USD">US dollar ($)</option>
              <option value="EUR">Euro (€)</option>
            </Select>
          </Field>
          <Field label="Monthly budget" hint="Optional. You can set budgets per category later.">
            <Input
              inputMode="decimal"
              placeholder="30000"
              value={d.monthly_budget ?? ''}
              onChange={(e) => set({ monthly_budget: e.target.value })}
            />
          </Field>
        </Grid>
      )
    case 'routine':
      return (
        <Grid>
          <Field label="Week starts on">
            <Select value={String(d.week_starts_on ?? 1)} onChange={(e) => set({ week_starts_on: Number(e.target.value) })}>
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </Select>
          </Field>
          <span className="hidden sm:block" />
          <Field label="Usually wake up">
            <Input type="time" value={d.wake ?? ''} onChange={(e) => set({ wake: e.target.value })} />
          </Field>
          <Field label="Usually go to bed">
            <Input type="time" value={d.bedtime ?? ''} onChange={(e) => set({ bedtime: e.target.value })} />
          </Field>
        </Grid>
      )
    case 'look':
      return (
        <div className="space-y-4">
          <Field label="Theme">
            <Segmented
              aria-label="Theme"
              value={d.theme ?? 'dark'}
              onChange={(theme) => (applyTheme(theme), set({ theme }))}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Field>
          <Field label="Accent colour">
            <div role="group" aria-label="Accent colour" className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-label={a.label}
                  aria-pressed={(d.accent ?? 'violet') === a.key}
                  onClick={() => (setAppearance({ accent: a.key }), set({ accent: a.key }))}
                  style={{ background: a.hex }}
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-card',
                    (d.accent ?? 'violet') === a.key && 'ring-2 ring-foreground',
                  )}
                >
                  {(d.accent ?? 'violet') === a.key && <Check className="h-4 w-4 text-white" aria-hidden />}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Spacing">
            <Segmented
              aria-label="Spacing"
              value={d.density ?? 'comfortable'}
              onChange={(density) => (setAppearance({ density }), set({ density }))}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </Field>
        </div>
      )
    default:
      return null
  }
}

function Summary({ d }) {
  const done = answeredSteps(normalizeAnswers(d))
  const rows = STEPS.filter((s) => s.key in done)
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Here is what we'll set up. Anything you skipped keeps its current value, and everything can be changed later in Settings.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span>{s.title}</span>
            <span className={cn('text-xs', done[s.key] ? 'text-success' : 'text-muted-foreground')}>{done[s.key] ? 'Set' : 'Skipped'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The first-run setup. Opens for an account that is `in_progress`; closing it (Esc, ✕ or "Do this later") puts it off, never discards it. */
export function OnboardingFlow() {
  const state = useOnboarding()
  const { settings, save } = useSettings()
  const { displayName } = useAuth()
  const open = state.status === 'in_progress'
  const [d, setD] = useState(() => ({ ...state.answers }))
  const [step, setStep] = useState(state.step)
  const seeded = useRef(false)

  // Pick up the saved answers when the flow opens (including after a resume or an account sync).
  useEffect(() => {
    if (!open) return void (seeded.current = false)
    if (seeded.current) return
    seeded.current = true
    setD({ ...state.answers, name: state.answers.name ?? (displayName || undefined) })
    setStep(state.step)
  }, [open, state.answers, state.step, displayName])

  // Progress is saved as the person goes, so closing the tab loses nothing.
  useEffect(() => {
    if (!open || !seeded.current) return
    const t = setTimeout(() => updateOnboarding({ step, answers: d }), 400)
    return () => clearTimeout(t)
  }, [open, step, d])

  const set = (change) => setD((prev) => ({ ...prev, ...change }))
  const key = STEPS[step].key
  const last = step === STEPS.length - 1
  const flush = (to) => {
    updateOnboarding({ step: to, answers: d })
    setStep(to)
  }
  const later = () => {
    updateOnboarding({ step, answers: d })
    putOffOnboarding()
  }

  const [finish, pending] = useAction(async () => {
    const plan = planApply(d, settings, parseMoney)
    if (plan.name && plan.name !== displayName) await auth.updateDisplayName(plan.name)
    if (Object.keys(plan.settings).length) await save(plan.settings)
    if (Object.keys(plan.appearance).length) setAppearance(plan.appearance)
    if (plan.pinned) setAppearance({ sidebar: { pinned: plan.pinned } })
    updateOnboarding({ answers: d })
    finishOnboarding()
    toast.success("You're all set", {
      description: 'Want a quick look around?',
      action: { label: 'Take the tour', onClick: () => startTour('dashboard') },
    })
  })

  const title = STEPS[step].title
  const footer = (
    <>
      <Button variant="ghost" onClick={later} className="mr-auto">
        Do this later
      </Button>
      {step > 0 && (
        <Button variant="outline" onClick={() => flush(step - 1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Button>
      )}
      {STEPS[step].optional && (
        <Button variant="ghost" onClick={() => flush(step + 1)}>
          Skip
        </Button>
      )}
      {last ? (
        <Button onClick={finish} loading={pending}>
          <Sparkles className="h-4 w-4" aria-hidden /> Finish setup
        </Button>
      ) : (
        <Button onClick={() => flush(step + 1)}>
          {step === 0 ? 'Get started' : 'Next'} <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && later()}
      title={title}
      description={`Step ${step + 1} of ${STEPS.length}`}
      footer={footer}
      className="md:max-w-xl"
    >
      <div data-testid="onboarding" className="space-y-4">
        <Progress value={progressOf(step)} label="Setup progress" />
        {key === 'confirm' ? <Summary d={d} /> : <StepBody step={key} d={d} set={set} />}
      </div>
    </Dialog>
  )
}
