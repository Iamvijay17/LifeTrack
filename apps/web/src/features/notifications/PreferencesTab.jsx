import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, Moon, Sparkles, SlidersHorizontal } from 'lucide-react'
import { CATEGORIES, LEAD_CHOICES, inQuietHours, quietEndsAtMs, validateSettings } from '@lifetrack/core/notifications'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { isKindEnabled } from '@/domain/reminders'
import { showSystemNotification, useBrowserNotifications } from './browserNotifications'
import { formatWhen } from './notificationFormat'
import { categoryStyle } from './notificationTheme'

/** What each category switch covers. A reminder's type is its category, so these switches govern reminders and the nudges from that module together. */
const COVERS = {
  custom: 'Reminders you set with the Custom type',
  task: 'Task reminders, tasks due today and overdue tasks',
  event: 'Alerts you add to events and timed tasks',
  habit: 'Habit reminders and the evening check-in',
  workout: 'Workout reminders and today’s planned workout',
  bill: 'Bill reminders, bills due and budget warnings',
  study: 'Study reminders and topics to revise',
  job: 'Interview heads-ups and job follow-ups',
  goal: 'Goals and milestones that are due',
}
const LEADS = { 15: '15 minutes before', 30: '30 minutes before', 60: '1 hour before', 120: '2 hours before', 1440: '1 day before' }

const STATUS = {
  granted: { tone: 'success', text: 'Allowed in this browser' },
  denied: { tone: 'danger', text: 'Blocked in this browser' },
  default: { tone: 'neutral', text: 'Not asked yet' },
  unsupported: { tone: 'neutral', text: 'Not supported here' },
}

const Row = ({ title, desc, children }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
    </div>
    {children}
  </div>
)

/**
 * Everything the person can tune. `settings` is notificationSettings(), `prefs` the per-category switches. Changes save as they are made; a value
 * that fails validation (quiet hours that start and end together, an evening nudge before the morning one) is explained and not saved.
 */
export function PreferencesTab({ settings, prefs, tz, onSettings, onCategory }) {
  const browser = useBrowserNotifications()
  const status = STATUS[browser.permission] ?? STATUS.default

  // Times are edited in a draft and saved once they are valid, so a half-finished edit never reaches the account.
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  const errors = validateSettings(draft)
  const edit = (patch) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    const problems = validateSettings(next)
    if (!Object.keys(problems).length) onSettings(patch)
  }
  const editQuiet = (patch) => edit({ quiet: { ...draft.quiet, ...patch } })

  const setDesktop = async (on) => {
    if (!on) return onSettings({ desktop: false })
    if (!browser.supported) return toast.error('This browser can’t show desktop notifications.')
    if (browser.permission === 'denied')
      return toast.error('Notifications are blocked for this site. Allow them in your browser’s site settings, then turn this on again.')
    const result = browser.permission === 'granted' ? 'granted' : await browser.request()
    if (result === 'granted') onSettings({ desktop: true })
    else toast.error('Permission wasn’t granted, so desktop notifications stay off.')
  }
  const sendTest = async () => {
    const shown = await showSystemNotification({
      title: 'LifeTrack notifications are on',
      body: 'This is what a reminder will look like.',
      tag: 'lifetrack-test',
    })
    if (!shown) toast.error('The browser didn’t show it. Check that notifications are allowed for this site.')
  }

  const now = Date.now()
  const quietNow = inQuietHours(settings, now, tz)
  const quietUntil = quietNow ? quietEndsAtMs(settings, now, tz) : null

  return (
    <div className="space-y-4">
      <SettingsSection icon={BellRing} title="Desktop notifications" desc="Pop-ups from your browser when LifeTrack isn’t in front.">
        <Row
          title="Show desktop notifications"
          desc="They appear while LifeTrack is open in a browser tab, even a background one. A closed browser can’t receive them."
        >
          <Switch checked={settings.desktop && browser.permission === 'granted'} onChange={setDesktop} label="Show desktop notifications" />
        </Row>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.text}</Badge>
          {settings.desktop && browser.permission !== 'granted' && browser.supported && (
            <span className="text-xs text-warning">
              Turned on, but this browser isn’t allowing them. Allow notifications for this site to receive them.
            </span>
          )}
          {settings.desktop && browser.permission === 'granted' && (
            <Button variant="outline" size="sm" onClick={sendTest}>
              Send a test notification
            </Button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection icon={Moon} title="Quiet hours" desc="Hold pop-ups and sounds overnight. Notifications still arrive in your inbox.">
        <Row title="Turn on quiet hours" desc={quietUntil ? `Quiet right now, until ${formatWhen(quietUntil, tz, now)}.` : undefined}>
          <Switch checked={draft.quiet.enabled} onChange={(v) => editQuiet({ enabled: v })} label="Quiet hours" />
        </Row>
        {draft.quiet.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" error={errors.quiet_from}>
                <Input type="time" value={draft.quiet.from} onChange={(e) => editQuiet({ from: e.target.value })} />
              </Field>
              <Field label="Until" error={errors.quiet_to}>
                <Input type="time" value={draft.quiet.to} onChange={(e) => editQuiet({ to: e.target.value })} />
              </Field>
            </div>
            <Row title="Let urgent notifications through" desc="Reminders you mark Urgent still pop up.">
              <Switch
                checked={draft.quiet.allow_urgent}
                onChange={(v) => editQuiet({ allow_urgent: v })}
                label="Let urgent notifications through"
              />
            </Row>
            <p className="text-xs text-muted-foreground">When quiet hours end, anything you missed is summed up in one message.</p>
          </>
        )}
      </SettingsSection>

      <SettingsSection
        icon={Sparkles}
        title="Smart notifications"
        desc="Nudges created from what’s on in your tasks, habits, fitness, bills and more."
      >
        <Row
          title="Create notifications from my modules"
          desc="One summary at a time, never one per item. You can switch categories off below."
        >
          <Switch checked={draft.smart} onChange={(v) => edit({ smart: v })} label="Smart notifications" />
        </Row>
        {draft.smart && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Morning summary" error={errors.morning} hint="Tasks, workout, bills, follow-ups">
              <Input type="time" value={draft.morning} onChange={(e) => edit({ morning: e.target.value })} />
            </Field>
            <Field label="Evening check-in" error={errors.evening} hint="Habits left, bills due tomorrow">
              <Input type="time" value={draft.evening} onChange={(e) => edit({ evening: e.target.value })} />
            </Field>
            <Field label="Interview heads-up" error={errors.lead_minutes}>
              <Select value={String(draft.lead_minutes)} onChange={(e) => edit({ lead_minutes: Number(e.target.value) })}>
                {LEAD_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {LEADS[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        icon={SlidersHorizontal}
        title="Categories"
        desc="Turn a category off and it stops everywhere: your devices and your phone."
      >
        <div className="-mx-2 space-y-0.5">
          {CATEGORIES.filter((c) => c.value !== 'system').map((c) => {
            const { icon: Icon, tile } = categoryStyle(c.value)
            return (
              <div key={c.value} className="flex items-center justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-muted/40">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${tile}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{COVERS[c.value]}</p>
                  </div>
                </div>
                <Switch checked={isKindEnabled(prefs, c.value)} onChange={(v) => onCategory(c.value, v)} label={c.label} />
              </div>
            )
          })}
        </div>
      </SettingsSection>
    </div>
  )
}
