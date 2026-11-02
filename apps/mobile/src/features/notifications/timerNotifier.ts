// Keeps exactly one OS notification scheduled for the end of the running focus timer. Dependencies injected for tests.
import { remainingSeconds } from '@lifetrack/core/focus'

export interface TimerLike { mode: 'focus' | 'short_break' | 'long_break'; plannedMinutes: number; endsAt: number | null }
export interface TimerNotifierDeps {
  schedule: (content: { title: string; body: string; data: Record<string, unknown> }, seconds: number) => Promise<string>
  cancel: (id: string) => Promise<void>
  storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }
  /** true when the OS lets us show notifications; never prompts */
  canNotify: () => Promise<boolean>
  now?: () => number
}
const KEY = 'lifetrack:focus-notification'

export function timerNotificationContent(t: TimerLike) {
  return t.mode === 'focus'
    ? { title: 'Focus session complete', body: `${t.plannedMinutes} minutes done. Time for a break?`, data: { kind: 'timer', link: '/focus' } }
    : { title: 'Break over', body: 'Ready for the next focus block?', data: { kind: 'timer', link: '/focus' } }
}

/** Whether (and how) to show an incoming notification. Timer alerts are suppressed in the foreground (the app already alerts). */
export function presentationFor(data: unknown, appState: string) {
  const isTimer = !!data && typeof data === 'object' && (data as { kind?: unknown }).kind === 'timer'
  const show = !(isTimer && appState === 'active')
  return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false }
}

export function createTimerNotifier(d: TimerNotifierDeps) {
  const now = d.now ?? Date.now
  const stored = async (): Promise<{ id: string; endsAt: number } | null> => { try { return JSON.parse((await d.storage.getItem(KEY)) ?? 'null') } catch { return null } }
  const clear = async () => {
    const s = await stored()
    if (s) await d.cancel(s.id).catch(() => {})
    await d.storage.removeItem(KEY)
  }
  return {
    /** Call whenever the timer state changes (and once at startup). Idempotent. */
    async sync(t: TimerLike | null) {
      const running = !!t && t.endsAt != null
      if (!running) return clear() // paused, stopped or finished: nothing should fire
      const s = await stored()
      if (s && s.endsAt === t!.endsAt) return // already scheduled for this exact end time
      await clear()
      const secs = remainingSeconds(t!.endsAt!, now())
      if (secs < 1 || !(await d.canNotify())) return // already over, or notifications are not allowed
      const id = await d.schedule(timerNotificationContent(t!), secs)
      await d.storage.setItem(KEY, JSON.stringify({ id, endsAt: t!.endsAt }))
    },
  }
}
