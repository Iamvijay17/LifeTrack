import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ExternalLink, Info, Maximize2, Minimize2, Moon, PictureInPicture2, SlidersHorizontal, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useSettings } from '@/hooks/useSettings'
import { useThemeSync } from '@/hooks/useTheme'
import { useAppearanceSync } from '@/hooks/useAppearance'
import { useToday } from '@/hooks/useToday'
import { useHabits } from '@/features/habits/useHabits'
import { useFocusTimer } from '@/features/focus/useFocusTimer'
import { WIDGET_LABEL, companionSnapshot, moveWidget, toggleWidget, visibleWidgets } from '@/domain/companion'
import { recordFocus } from '@/services/api'
import { fmtDay } from '@/lib/dates'
import { sound } from '@/lib/interaction/SoundManager'
import { celebrate } from '@/lib/celebrate'
import { cn } from '@/lib/utils'
import { resetCompanionPrefs, useCompanionPrefs } from './useCompanionPrefs'
import { detectCapabilities, useFloatingWindow } from './window'
import { CapabilityNote } from './Capabilities'
import { CollapsedBar, HabitsWidget, QuickAddWidget, TasksWidget, TimerWidget, UpcomingWidget } from './widgets'

function Customize({ prefs, update, caps, onClose }) {
  return (
    <section aria-label="Customise" className="lt-card space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Layout</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {prefs.order.map((id, i) => (
          <li key={id} className="flex items-center gap-1.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm">{WIDGET_LABEL[id]}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${WIDGET_LABEL[id]} up`}
              disabled={i === 0}
              onClick={() => update({ order: moveWidget(prefs.order, id, -1) })}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${WIDGET_LABEL[id]} down`}
              disabled={i === prefs.order.length - 1}
              onClick={() => update({ order: moveWidget(prefs.order, id, 1) })}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Switch
              label={`Show ${WIDGET_LABEL[id]}`}
              checked={!prefs.hidden.includes(id)}
              onChange={() => update(toggleWidget(prefs, id))}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">Spacing</span>
        <Segmented
          value={prefs.density}
          onChange={(density) => update({ density })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </div>
      <details className="rounded-lg bg-surface-2/60 p-2.5">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
          <Info className="h-3.5 w-3.5" aria-hidden />
          What works in this browser
        </summary>
        <div className="pt-2.5">
          <CapabilityNote caps={caps} />
        </div>
      </details>
      <Button variant="outline" size="sm" onClick={resetCompanionPrefs}>
        Restore default layout
      </Button>
    </section>
  )
}

/** The widgets themselves. Rendered in this window, or in the floating one through a portal. */
function Body({ prefs, update, snap, timer, today, editing, onCloseEdit, caps }) {
  const shown = visibleWidgets(prefs)
  const widgets = {
    add: <QuickAddWidget today={today} />,
    progress: <TasksWidget snap={snap} today={today} />,
    habits: <HabitsWidget snap={snap} today={today} />,
    timer: <TimerWidget timer={timer} today={today} />,
    upcoming: <UpcomingWidget snap={snap} today={today} />,
  }
  if (editing) return <Customize prefs={prefs} update={update} caps={caps} onClose={onCloseEdit} />
  if (prefs.collapsed) return <CollapsedBar snap={snap} timer={timer} />
  if (shown.length === 0)
    return (
      <p className="lt-card p-4 text-center text-sm text-muted-foreground">
        Everything is hidden. Open the layout menu to bring something back.
      </p>
    )
  return (
    <div className={prefs.density === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {shown.map((id) => (
        <div key={id}>{widgets[id]}</div>
      ))}
    </div>
  )
}

/**
 * The Desktop Companion: today in a small window. A page of its own (no sidebar), so it fits a 380-pixel window or a floating one.
 * It reads and writes the same data as the rest of LifeTrack through the same functions; nothing here is a second copy.
 */
export default function CompanionPage() {
  const today = useToday()
  const { settings } = useSettings()
  const [prefs, update] = useCompanionPrefs()
  const { win, open, close, supported } = useFloatingWindow()
  const [editing, setEditing] = useState(false)
  useThemeSync()
  useAppearanceSync()

  const { data, loading } = useTables('tasks', 'goals', 'milestones', 'reminders', 'interview_events', 'job_applications')
  const { stats } = useHabits(today, settings.week_starts_on)
  const snap = useMemo(
    () =>
      companionSnapshot(
        {
          tasks: data.tasks,
          habitStats: stats,
          goals: data.goals,
          milestones: data.milestones,
          reminders: data.reminders,
          interviews: data.interview_events,
          applications: data.job_applications,
        },
        { today, tz: settings.timezone, nowMs: Date.now() },
      ),
    [data, stats, today, settings.timezone],
  )

  // A block that ends is saved by whichever window finishes it first (the shared timer state is claimed), exactly as on the Focus page.
  const [record] = useAction(recordFocus)
  const timer = useFocusTimer({
    onFinish: async (t, completed) => {
      sound.play(t.mode === 'focus' ? 'focusDone' : 'notify')
      if (t.mode !== 'focus') return toast('Break over. Ready for the next focus block?')
      const saved = await record({
        plannedMinutes: t.plannedMinutes,
        actualSeconds: t.plannedMinutes * 60,
        completed,
        taskId: t.taskId,
        topicId: t.topicId,
        label: t.label,
        date: today,
      })
      if (saved) {
        toast.success('Focus session complete', { description: `${t.plannedMinutes} minutes recorded.` })
        celebrate({ count: 40 })
      }
    },
  })

  useEffect(() => {
    const was = document.title
    document.title = timer.timer
      ? `${String(Math.floor(timer.left / 60)).padStart(2, '0')}:${String(timer.left % 60).padStart(2, '0')} · LifeTrack`
      : 'Companion · LifeTrack'
    return () => {
      document.title = was
    }
  }, [timer.timer, timer.left])

  // Light or dark for this window only. "App" follows Settings (useThemeSync); the others override it here without touching the account's theme.
  useLayoutEffect(() => {
    if (prefs.theme === 'app') return
    const dark = prefs.theme === 'dark'
    for (const doc of [document, win?.document]) doc?.documentElement.classList.toggle('dark', dark)
  }, [prefs.theme, win, settings.theme])

  // A small window has no room for the sidebar's ambient module colour; use the dashboard's.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.module = 'dashboard'
    return () => delete root.dataset.module
  }, [])

  const dark = (win?.document ?? document).documentElement.classList.contains('dark')
  const cycleTheme = () => update({ theme: dark ? 'light' : 'dark' })

  // Minimise: collapse to the slim bar, and shrink the window itself where the browser allows it (only windows a script opened can be resized).
  const toggleCollapsed = () => {
    const next = !prefs.collapsed
    update({ collapsed: next })
    try {
      if (window.opener || window.name === 'lifetrack-companion') window.resizeTo(380, next ? 150 : 640)
    } catch {
      /* the layout still collapses */
    }
  }
  const [float] = useAction(async () => {
    await open()
  })

  const caps = useMemo(detectCapabilities, [])
  const header = (
    <header className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Logo showText={false} />
        <p className="sr-only">LifeTrack Companion</p>
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{fmtDay(today, 'EEEE d MMM')}</p>
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={cycleTheme}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Customise layout" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={prefs.collapsed ? 'Expand' : 'Minimise'} onClick={toggleCollapsed}>
          {prefs.collapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </Button>
        {supported && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={win ? 'Bring back to this window' : 'Float on top of other windows'}
            aria-pressed={!!win}
            onClick={win ? close : float}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </Button>
        )}
        <Link
          to="/"
          target="lifetrack-main"
          aria-label="Open LifeTrack"
          className="inline-grid h-10 w-10 place-items-center rounded-md hover:bg-muted/60 md:h-8 md:w-8"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )

  const content = (
    <div className={cn('mx-auto w-full max-w-md p-3', prefs.density === 'compact' ? 'space-y-2' : 'space-y-3')}>
      {header}
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading today…</p>
      ) : (
        <Body
          prefs={prefs}
          update={update}
          snap={snap}
          timer={timer}
          today={today}
          editing={editing}
          onCloseEdit={() => setEditing(false)}
          caps={caps}
        />
      )}
    </div>
  )

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {win ? (
        <>
          <div className="mx-auto max-w-md space-y-3 p-6 text-center">
            <PictureInPicture2 className="mx-auto h-8 w-8 text-mod-text" aria-hidden />
            <p className="text-sm font-medium">The companion is floating on top of your other windows.</p>
            <Button variant="outline" onClick={close}>
              Bring it back here
            </Button>
          </div>
          {createPortal(content, win.document.body)}
        </>
      ) : (
        content
      )}
    </div>
  )
}
