import { describe, expect, it, vi } from 'vitest'
import { createTimerNotifier, presentationFor, timerNotificationContent } from '../src/features/notifications/timerNotifier'

const NOW = 1_700_000_000_000
const make = (canNotify = true) => {
  const m = new Map<string, string>()
  const scheduled: { id: string; seconds: number; title: string }[] = []
  const cancel = vi.fn(async (_id: string) => {})
  let n = 0
  const deps = {
    schedule: async (c: { title: string }, seconds: number) => { const id = `n${++n}`; scheduled.push({ id, seconds, title: c.title }); return id },
    cancel, canNotify: async () => canNotify, now: () => NOW,
    storage: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v) }, removeItem: async (k: string) => { m.delete(k) } },
  }
  return { sync: createTimerNotifier(deps).sync, scheduled, cancel, m }
}
const T = (over: Partial<{ mode: 'focus' | 'short_break' | 'long_break'; plannedMinutes: number; endsAt: number | null }> = {}) => ({ mode: 'focus' as const, plannedMinutes: 25, endsAt: NOW + 25 * 60_000, ...over })

describe('timer notification sync', () => {
  it('schedules one notification for the end time, and re-syncing the same state does nothing', async () => {
    const { sync, scheduled } = make()
    await sync(T())
    await sync(T())
    await sync(T())
    expect(scheduled).toEqual([{ id: 'n1', seconds: 1500, title: 'Focus session complete' }])
  })
  it('pausing cancels it; resuming schedules the new, later end time', async () => {
    const { sync, scheduled, cancel, m } = make()
    await sync(T())
    await sync(T({ endsAt: null }))
    expect(cancel).toHaveBeenCalledWith('n1')
    expect(m.has('lifetrack:focus-notification')).toBe(false)
    await sync(T({ endsAt: NOW + 600_000 }))
    expect(scheduled.at(-1)).toMatchObject({ id: 'n2', seconds: 600 })
  })
  it('stopping (null) cancels; a restarted timer replaces the old notification', async () => {
    const { sync, scheduled, cancel } = make()
    await sync(T())
    await sync(T({ endsAt: NOW + 3000_000, plannedMinutes: 50 }))
    expect(cancel).toHaveBeenCalledWith('n1')
    expect(scheduled).toHaveLength(2)
    await sync(null)
    expect(cancel).toHaveBeenCalledWith('n2')
  })
  it('breaks get their own wording; already-finished timers and denied permission schedule nothing', async () => {
    expect(timerNotificationContent(T({ mode: 'short_break' })).title).toBe('Break over')
    expect(timerNotificationContent(T()).body).toContain('25 minutes')
    const over = make(); await over.sync(T({ endsAt: NOW - 1000 })); expect(over.scheduled).toHaveLength(0)
    const denied = make(false); await denied.sync(T()); expect(denied.scheduled).toHaveLength(0)
  })
})

describe('presentationFor (foreground behaviour)', () => {
  it('timer alerts are silent banners-wise while the app is open, but reminders always show', () => {
    expect(presentationFor({ kind: 'timer' }, 'active')).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false })
    expect(presentationFor({ kind: 'timer' }, 'background')).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true })
    expect(presentationFor({ kind: 'task', link: '/planner' }, 'active')).toMatchObject({ shouldShowBanner: true, shouldShowList: true })
    for (const bad of [null, undefined, 'x', 3, {}]) expect(presentationFor(bad, 'active').shouldShowBanner).toBe(true)
  })
})
